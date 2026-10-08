const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
require("dotenv").config({ override: true });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
});

const users = [
    {
        name: "Repository Admin",
        email: "admin@unirepo.com",
        password: "Admin@123",
        role: "Admin"
    },
    {
        name: "Demo Faculty",
        email: "faculty@unirepo.com",
        password: "Faculty@123",
        role: "Faculty"
    },
    {
        name: "Demo Student",
        email: "student@unirepo.com",
        password: "Student@123",
        role: "Student"
    }
];

async function seedUsers() {
    try {
        for (const user of users) {
            const hashedPassword = await bcrypt.hash(user.password, 10);

            await pool.query(
                `INSERT INTO users (name, email, password, role)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (email)
                 DO UPDATE SET
                    name = EXCLUDED.name,
                    password = EXCLUDED.password,
                    role = EXCLUDED.role`,
                [user.name, user.email, hashedPassword, user.role]
            );

            console.log(`${user.role} user ready: ${user.email}`);
        }

        console.log("All demo users created successfully!");
    } catch (error) {
        console.error("Error creating users:", error.message);
    } finally {
        await pool.end();
    }
}

seedUsers();