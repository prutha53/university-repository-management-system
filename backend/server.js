require("dotenv").config({ override: true });

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const pool = require("./db");

const app = express();

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error("ERROR: JWT_SECRET is missing from .env");
    process.exit(1);
}

app.use(cors());
app.use(express.json());

// =====================================================
// UPLOAD DIRECTORY
// =====================================================

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// =====================================================
// MULTER CONFIGURATION
// Supported: PDF, DOCX, PPTX, XLSX
// =====================================================

const allowedExtensions = [
    ".pdf",
    ".docx",
    ".pptx",
    ".xlsx"
];

const allowedMimeTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
];

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },

    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();

        const safeFileName =
            `document-${Date.now()}-${randomUUID()}${extension}`;

        cb(null, safeFileName);
    }
});

const upload = multer({
    storage,

    limits: {
        fileSize: 20 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();

        if (!allowedExtensions.includes(extension)) {
            return cb(
                new Error(
                    "Only PDF, DOCX, PPTX and XLSX files are allowed"
                )
            );
        }

        if (
            file.mimetype &&
            !allowedMimeTypes.includes(file.mimetype)
        ) {
            return cb(
                new Error("Invalid document file type")
            );
        }

        cb(null, true);
    }
});

// =====================================================
// HELPER - DELETE UPLOADED FILE IF NEEDED
// =====================================================

function removeFile(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        console.error("File cleanup error:", error.message);
    }
}

// =====================================================
// JWT AUTHENTICATION
// =====================================================

function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;

    const token =
        authHeader && authHeader.startsWith("Bearer ")
            ? authHeader.split(" ")[1]
            : null;

    if (!token) {
        return res.status(401).json({
            message: "Access token required"
        });
    }

    jwt.verify(token, JWT_SECRET, (error, user) => {
        if (error) {
            return res.status(403).json({
                message: "Invalid or expired token"
            });
        }

        req.user = user;
        next();
    });
}

// =====================================================
// GET USER HIERARCHY INFORMATION
// =====================================================

async function getUserRoles(userId) {
    const result = await pool.query(
        `SELECT
            r.id,
            r.role_name,
            r.hierarchy_level
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = $1
         ORDER BY r.hierarchy_level DESC`,
        [userId]
    );

    return result.rows;
}

async function getUserHierarchyLevel(userId) {
    const result = await pool.query(
        `SELECT
            COALESCE(MAX(r.hierarchy_level), 0) AS level
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = $1`,
        [userId]
    );

    return Number(result.rows[0].level);
}

async function getHighestRoleName(userId) {
    const result = await pool.query(
        `SELECT r.role_name
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = $1
         ORDER BY r.hierarchy_level DESC
         LIMIT 1`,
        [userId]
    );

    return result.rows.length > 0
        ? result.rows[0].role_name
        : "Student";
}

// =====================================================
// DOCUMENT ACCESS RULE
//
// Owner can always access.
// Otherwise, only users at the same or HIGHER
// hierarchy level can access.
// =====================================================

async function canAccessDocument(userId, document) {
    if (Number(document.uploaded_by) === Number(userId)) {
        return true;
    }

    const userLevel = await getUserHierarchyLevel(userId);

    return (
        userLevel >= Number(document.required_hierarchy_level || 0)
    );
}

// =====================================================
// AUDIT LOGGER
// =====================================================

async function createAuditLog(
    userId,
    documentId,
    action,
    documentTitle = null
) {
    await pool.query(
        `INSERT INTO audit_logs
         (user_id, document_id, action, document_title)
         VALUES ($1, $2, $3, $4)`,
        [
            userId,
            documentId || null,
            action,
            documentTitle
        ]
    );
}

// =====================================================
// TEST / HEALTH ROUTE
// =====================================================

app.get("/", (req, res) => {
    res.json({
        message: "University Repository Backend is Working!"
    });
});

app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        message: "University Repository API is running"
    });
});

// =====================================================
// LOGIN API
// =====================================================

app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        const result = await pool.query(
            `SELECT id, name, email, password, role
             FROM users
             WHERE email = $1`,
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const user = result.rows[0];

        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const roles = await getUserRoles(user.id);

        const hierarchyLevel =
            roles.length > 0
                ? Math.max(
                    ...roles.map(role =>
                        Number(role.hierarchy_level)
                    )
                )
                : 0;

        const token = jwt.sign(
            {
                id: user.id,
                role: user.role,
                hierarchyLevel
            },
            JWT_SECRET,
            {
                expiresIn: "2h"
            }
        );

        await createAuditLog(
            user.id,
            null,
            "LOGIN",
            null
        );

        res.json({
            message: "Login successful",

            token,

            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                hierarchyLevel,
                roles
            }
        });

    } catch (error) {
        console.error("Login error:", error.message);

        res.status(500).json({
            message: "Server error"
        });
    }
});

// =====================================================
// LOGOUT API
// =====================================================

app.post(
    "/api/logout",
    authenticateToken,
    async (req, res) => {
        try {
            await createAuditLog(
                req.user.id,
                null,
                "LOGOUT",
                null
            );

            res.json({
                message: "Logout recorded successfully"
            });

        } catch (error) {
            console.error(
                "Logout error:",
                error.message
            );

            res.status(500).json({
                message: "Logout failed"
            });
        }
    }
);

// =====================================================
// CURRENT USER API
// =====================================================

app.get(
    "/api/me",
    authenticateToken,
    async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT id, name, email, role
                 FROM users
                 WHERE id = $1`,
                [req.user.id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: "User not found"
                });
            }

            const user = result.rows[0];

            const roles = await getUserRoles(user.id);

            res.json({
                user,
                roles,
                hierarchyLevel:
                    await getUserHierarchyLevel(user.id)
            });

        } catch (error) {
            console.error(
                "Profile error:",
                error.message
            );

            res.status(500).json({
                message: "Failed to get user information"
            });
        }
    }
);

// =====================================================
// UPLOAD DOCUMENT
// =====================================================

app.post(
    "/api/documents",
    authenticateToken,
    upload.single("document"),

    async (req, res) => {
        try {
            // Student cannot upload
            if (req.user.role === "Student") {
                if (req.file) {
                    removeFile(req.file.path);
                }

                return res.status(403).json({
                    message:
                        "Students are not allowed to upload documents"
                });
            }

            if (!req.file) {
                return res.status(400).json({
                    message: "Please upload a document"
                });
            }

            const {
                title,
                category,
                department,
                folder_id
            } = req.body;

            if (!title || !category || !folder_id) {
                removeFile(req.file.path);

                return res.status(400).json({
                    message:
                        "Title, category and folder are required"
                });
            }

            // Verify folder
            const folderResult = await pool.query(
                `SELECT *
                 FROM folders
                 WHERE id = $1`,
                [folder_id]
            );

            if (folderResult.rows.length === 0) {
                removeFile(req.file.path);

                return res.status(404).json({
                    message: "Folder not found"
                });
            }

            // Check folder applicability
            const applicableResult = await pool.query(
                `SELECT EXISTS (
                    SELECT 1
                    FROM folder_applicability fa
                    JOIN user_roles ur
                      ON ur.role_id = fa.role_id
                    WHERE fa.folder_id = $1
                      AND ur.user_id = $2
                      AND fa.applicable = TRUE
                ) AS applicable`,
                [folder_id, req.user.id]
            );

            const isApplicable =
                applicableResult.rows[0].applicable;

            const hierarchyLevel =
                await getUserHierarchyLevel(req.user.id);

            /*
             * User must have an applicable folder.
             * Senior Management / Administration may also
             * upload if folder was assigned to their role.
             */

            if (!isApplicable) {
                removeFile(req.file.path);

                return res.status(403).json({
                    message:
                        "This folder is not applicable to your role"
                });
            }

            const uploaderRole =
                await getHighestRoleName(req.user.id);

            const filePath =
                `/uploads/${req.file.filename}`;

            const fileType =
                path.extname(
                    req.file.originalname
                ).toLowerCase();

            /*
             * IMPORTANT:
             * Access is NOT decided by a value sent by
             * the frontend.
             *
             * It is automatically based on uploader's
             * highest hierarchy level.
             */

            const result = await pool.query(
                `INSERT INTO documents
                (
                    title,
                    category,
                    department,
                    file_path,
                    access_level,
                    uploaded_by,
                    created_at,
                    folder_id,
                    file_type,
                    required_hierarchy_level
                )
                VALUES
                (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    CURRENT_TIMESTAMP,
                    $7,
                    $8,
                    $9
                )
                RETURNING *`,

                [
                    title,
                    category,
                    department || null,
                    filePath,
                    uploaderRole,
                    req.user.id,
                    folder_id,
                    fileType,
                    hierarchyLevel
                ]
            );

            const document =
                result.rows[0];

            await createAuditLog(
                req.user.id,
                document.id,
                "UPLOAD",
                document.title
            );

            res.status(201).json({
                message:
                    "Document uploaded successfully",
                document
            });

        } catch (error) {
            if (req.file) {
                removeFile(req.file.path);
            }

            console.error(
                "Upload error:",
                error.message
            );

            res.status(500).json({
                message:
                    error.message ||
                    "Failed to upload document"
            });
        }
    }
);

// =====================================================
// GET DOCUMENTS
// Search + category + folder filtering
// =====================================================

app.get(
    "/api/documents",
    authenticateToken,
    async (req, res) => {
        try {
            const {
                search = "",
                category = "",
                folder_id = ""
            } = req.query;

            const userLevel =
                await getUserHierarchyLevel(
                    req.user.id
                );

            let query = `
                SELECT
                    d.*,
                    u.name AS uploaded_by_name,
                    f.folder_name
                FROM documents d
                LEFT JOIN users u
                    ON d.uploaded_by = u.id
                LEFT JOIN folders f
                    ON d.folder_id = f.id
                WHERE
                    (
                        d.uploaded_by = $1
                        OR d.required_hierarchy_level <= $2
                    )
            `;

            const values = [
                req.user.id,
                userLevel
            ];

            let index = 3;

            if (search.trim() !== "") {
                query += `
                    AND (
                        LOWER(d.title) LIKE LOWER($${index})
                        OR LOWER(d.category) LIKE LOWER($${index})
                        OR LOWER(COALESCE(d.department, ''))
                            LIKE LOWER($${index})
                    )
                `;

                values.push(`%${search}%`);
                index++;
            }

            if (category.trim() !== "") {
                query += `
                    AND d.category = $${index}
                `;

                values.push(category);
                index++;
            }

            if (folder_id.trim() !== "") {
                query += `
                    AND d.folder_id = $${index}
                `;

                values.push(folder_id);
                index++;
            }

            query += `
                ORDER BY d.created_at DESC
            `;

            const result =
                await pool.query(query, values);

            res.json({
                documents: result.rows
            });

        } catch (error) {
            console.error(
                "Documents error:",
                error.message
            );

            res.status(500).json({
                message:
                    "Failed to fetch documents"
            });
        }
    }
);

// =====================================================
// GET SINGLE DOCUMENT METADATA
// =====================================================

app.get(
    "/api/documents/:id",
    authenticateToken,
    async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT
                    d.*,
                    u.name AS uploaded_by_name,
                    f.folder_name
                 FROM documents d
                 LEFT JOIN users u
                    ON d.uploaded_by = u.id
                 LEFT JOIN folders f
                    ON d.folder_id = f.id
                 WHERE d.id = $1`,
                [req.params.id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: "Document not found"
                });
            }

            const document =
                result.rows[0];

            const allowed =
                await canAccessDocument(
                    req.user.id,
                    document
                );

            if (!allowed) {
                await createAuditLog(
                    req.user.id,
                    document.id,
                    "DENIED",
                    document.title
                );

                return res.status(403).json({
                    message: "Access denied"
                });
            }

            res.json({
                document
            });

        } catch (error) {
            console.error(
                "Document details error:",
                error.message
            );

            res.status(500).json({
                message:
                    "Failed to fetch document"
            });
        }
    }
);

// =====================================================
// VIEW DOCUMENT
// =====================================================

app.get(
    "/api/documents/:id/view",
    authenticateToken,
    async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT *
                 FROM documents
                 WHERE id = $1`,
                [req.params.id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: "Document not found"
                });
            }

            const document =
                result.rows[0];

            const allowed =
                await canAccessDocument(
                    req.user.id,
                    document
                );

            if (!allowed) {
                await createAuditLog(
                    req.user.id,
                    document.id,
                    "DENIED",
                    document.title
                );

                return res.status(403).json({
                    message: "Access denied"
                });
            }

            const fileName =
                path.basename(
                    document.file_path
                );

            const filePath =
                path.join(
                    uploadDir,
                    fileName
                );

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({
                    message: "File not found"
                });
            }

            await createAuditLog(
                req.user.id,
                document.id,
                "VIEW",
                document.title
            );

            res.sendFile(
                filePath,
                {
                    headers: {
                        "Content-Disposition":
                            `inline; filename="${fileName}"`
                    }
                }
            );

        } catch (error) {
            console.error(
                "View error:",
                error.message
            );

            res.status(500).json({
                message:
                    "Failed to view document"
            });
        }
    }
);

// =====================================================
// DOWNLOAD DOCUMENT
// =====================================================

app.get(
    "/api/documents/:id/download",
    authenticateToken,
    async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT *
                 FROM documents
                 WHERE id = $1`,
                [req.params.id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: "Document not found"
                });
            }

            const document =
                result.rows[0];

            const allowed =
                await canAccessDocument(
                    req.user.id,
                    document
                );

            if (!allowed) {
                await createAuditLog(
                    req.user.id,
                    document.id,
                    "DENIED",
                    document.title
                );

                return res.status(403).json({
                    message: "Access denied"
                });
            }

            const fileName =
                path.basename(
                    document.file_path
                );

            const filePath =
                path.join(
                    uploadDir,
                    fileName
                );

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({
                    message: "File not found"
                });
            }

            await createAuditLog(
                req.user.id,
                document.id,
                "DOWNLOAD",
                document.title
            );

            res.download(
                filePath,
                fileName
            );

        } catch (error) {
            console.error(
                "Download error:",
                error.message
            );

            res.status(500).json({
                message:
                    "Failed to download document"
            });
        }
    }
);

// =====================================================
// DELETE DOCUMENT
// ONLY ORIGINAL UPLOADER
// =====================================================

app.delete(
    "/api/documents/:id",
    authenticateToken,
    async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT *
                 FROM documents
                 WHERE id = $1`,
                [req.params.id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: "Document not found"
                });
            }

            const document =
                result.rows[0];

            if (
                Number(document.uploaded_by) !==
                Number(req.user.id)
            ) {
                await createAuditLog(
                    req.user.id,
                    document.id,
                    "DELETE_DENIED",
                    document.title
                );

                return res.status(403).json({
                    message:
                        "Only the original uploader can delete this document"
                });
            }

            const fileName =
                path.basename(
                    document.file_path
                );

            const filePath =
                path.join(
                    uploadDir,
                    fileName
                );

            // Delete database record first
            await pool.query(
                `DELETE FROM documents
                 WHERE id = $1`,
                [document.id]
            );

            // Then delete physical file
            removeFile(filePath);

            /*
             * document_id is NULL because the document
             * has already been deleted.
             *
             * document_title preserves the audit history.
             */
            await createAuditLog(
                req.user.id,
                null,
                "DELETE",
                document.title
            );

            res.json({
                message:
                    "Document deleted successfully"
            });

        } catch (error) {
            console.error(
                "Delete error:",
                error.message
            );

            res.status(500).json({
                message:
                    "Failed to delete document"
            });
        }
    }
);

// =====================================================
// GET FOLDERS
// Returns Applicable / Not Applicable
// =====================================================

app.get(
    "/api/folders",
    authenticateToken,
    async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT
                    f.id,
                    f.folder_name,
                    f.created_at,
                    CASE
                        WHEN EXISTS (
                            SELECT 1
                            FROM folder_applicability fa
                            JOIN user_roles ur
                              ON ur.role_id = fa.role_id
                            WHERE fa.folder_id = f.id
                              AND ur.user_id = $1
                              AND fa.applicable = TRUE
                        )
                        THEN TRUE
                        ELSE FALSE
                    END AS applicable
                 FROM folders f
                 ORDER BY f.folder_name`,
                [req.user.id]
            );

            res.json({
                folders: result.rows
            });

        } catch (error) {
            console.error(
                "Folder error:",
                error.message
            );

            res.status(500).json({
                message:
                    "Failed to fetch folders"
            });
        }
    }
);

// =====================================================
// CREATE FOLDER
// Administration / Dean or HIGHER
// =====================================================

app.post(
    "/api/folders",
    authenticateToken,
    async (req, res) => {
        try {
            const hierarchyLevel =
                await getUserHierarchyLevel(
                    req.user.id
                );

            if (hierarchyLevel < 4) {
                return res.status(403).json({
                    message:
                        "Only Administration / Dean or higher can create folders"
                });
            }

            const {
                folder_name,
                applicable_roles = []
            } = req.body;

            if (
                !folder_name ||
                !folder_name.trim()
            ) {
                return res.status(400).json({
                    message:
                        "Folder name is required"
                });
            }

            if (
                !Array.isArray(
                    applicable_roles
                )
            ) {
                return res.status(400).json({
                    message:
                        "applicable_roles must be an array"
                });
            }

            const folderResult =
                await pool.query(
                    `INSERT INTO folders
                    (
                        folder_name,
                        created_by
                    )
                    VALUES ($1, $2)
                    RETURNING *`,
                    [
                        folder_name.trim(),
                        req.user.id
                    ]
                );

            const folder =
                folderResult.rows[0];

            for (
                const roleName
                of applicable_roles
            ) {
                await pool.query(
                    `INSERT INTO
                        folder_applicability
                        (
                            folder_id,
                            role_id,
                            applicable
                        )
                     SELECT
                        $1,
                        id,
                        TRUE
                     FROM roles
                     WHERE role_name = $2
                     ON CONFLICT
                     DO NOTHING`,
                    [
                        folder.id,
                        roleName
                    ]
                );
            }

            await createAuditLog(
                req.user.id,
                null,
                "FOLDER_CREATE",
                folder.folder_name
            );

            res.status(201).json({
                message:
                    "Folder created successfully",
                folder
            });

        } catch (error) {
            if (
                error.code === "23505"
            ) {
                return res.status(400).json({
                    message:
                        "Folder already exists"
                });
            }

            console.error(
                "Create folder error:",
                error.message
            );

            res.status(500).json({
                message:
                    "Failed to create folder"
            });
        }
    }
);

// =====================================================
// AUDIT LOGS
// Administration / Dean or HIGHER
// =====================================================

app.get(
    "/api/audit",
    authenticateToken,
    async (req, res) => {
        try {
            const hierarchyLevel =
                await getUserHierarchyLevel(
                    req.user.id
                );

            if (hierarchyLevel < 4) {
                return res.status(403).json({
                    message:
                        "Only Administration / Dean or higher can view audit logs"
                });
            }

            const result = await pool.query(`
                SELECT
                    a.id,
                    u.name AS user_name,
                    u.role AS user_role,
                    COALESCE(
                        d.title,
                        a.document_title
                    ) AS document_title,
                    a.action,
                    a.created_at
                FROM audit_logs a
                LEFT JOIN users u
                    ON a.user_id = u.id
                LEFT JOIN documents d
                    ON a.document_id = d.id
                ORDER BY a.created_at DESC
            `);

            res.json({
                audit_logs:
                    result.rows
            });

        } catch (error) {
            console.error(
                "Audit error:",
                error.message
            );

            res.status(500).json({
                message:
                    "Failed to fetch audit logs"
            });
        }
    }
);

// =====================================================
// MULTER / GENERAL ERROR HANDLER
// =====================================================

app.use(
    (error, req, res, next) => {
        if (
            error instanceof multer.MulterError
        ) {
            if (
                error.code ===
                "LIMIT_FILE_SIZE"
            ) {
                return res.status(400).json({
                    message:
                        "File size cannot exceed 20 MB"
                });
            }

            return res.status(400).json({
                message: error.message
            });
        }

        if (error) {
            return res.status(400).json({
                message: error.message
            });
        }

        next();
    }
);

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {
    console.log(
        `Server running on http://localhost:${PORT}`
    );
});