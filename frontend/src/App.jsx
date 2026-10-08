import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Activity,
  Archive,
  ArrowDownToLine,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  Clock3,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  FileType2,
  Folder,
  FolderPlus,
  GraduationCap,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  UsersRound,
  X,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const DEMO_USERS = [
  { role: "Admin", email: "admin@unirepo.com", password: "Admin@123" },
  { role: "Faculty", email: "faculty@unirepo.com", password: "Faculty@123" },
  { role: "Student", email: "student@unirepo.com", password: "Student@123" },
];

const NAV_ITEMS = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "documents", label: "Documents", icon: LibraryBig },
  { id: "folders", label: "Folders", icon: Folder },
  { id: "activity", label: "Audit Activity", icon: Activity },
];

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fileKind(fileType = "") {
  const type = fileType.toLowerCase();
  if (type === ".pdf") return "PDF";
  if (type === ".docx") return "DOCX";
  if (type === ".pptx") return "PPTX";
  if (type === ".xlsx") return "XLSX";
  return "FILE";
}

function levelLabel(level) {
  const map = {
    0: "Student",
    1: "Staff",
    2: "Associate HoD",
    3: "HoD",
    4: "Administration / Dean",
    5: "Senior Management",
  };
  return map[Number(level)] || "University User";
}

function initials(name = "User") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(getStoredUser);
  const [page, setPage] = useState("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const isAuthed = Boolean(token && user);
  const isAdminish = Number(user?.hierarchyLevel || 0) >= 4;
  const canUpload = user?.role !== "Student";

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  const notify = useCallback((type, message) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const handleAxiosError = useCallback(
    (error, fallback = "Something went wrong") => {
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        const message = error.response?.data?.message || fallback;
        notify("error", message);
      } else {
        notify("error", error?.response?.data?.message || fallback);
      }
    },
    [notify]
  );

  const loadDocuments = useCallback(async () => {
    if (!token) return;
    setLoadingDocs(true);
    try {
      const { data } = await axios.get(`${API}/api/documents`, {
        headers: authHeaders,
        params: {
          search: search || undefined,
          category: category || undefined,
          folder_id: folderFilter || undefined,
        },
      });
      setDocuments(data.documents || []);
    } catch (error) {
      handleAxiosError(error, "Could not load documents");
    } finally {
      setLoadingDocs(false);
    }
  }, [authHeaders, category, folderFilter, handleAxiosError, search, token]);

  const loadFolders = useCallback(async () => {
    if (!token) return;
    setLoadingFolders(true);
    try {
      const { data } = await axios.get(`${API}/api/folders`, {
        headers: authHeaders,
      });
      setFolders(data.folders || []);
    } catch (error) {
      handleAxiosError(error, "Could not load folders");
    } finally {
      setLoadingFolders(false);
    }
  }, [authHeaders, handleAxiosError, token]);

  const loadAudit = useCallback(async () => {
    if (!token || !isAdminish) return;
    setLoadingAudit(true);
    try {
      const { data } = await axios.get(`${API}/api/audit`, {
        headers: authHeaders,
      });
      setAuditLogs(data.audit_logs || []);
    } catch (error) {
      handleAxiosError(error, "Could not load audit activity");
    } finally {
      setLoadingAudit(false);
    }
  }, [authHeaders, handleAxiosError, isAdminish, token]);

  useEffect(() => {
    if (!isAuthed) return;
    loadDocuments();
  }, [isAuthed, loadDocuments, refreshKey]);

  useEffect(() => {
    if (!isAuthed) return;
    loadFolders();
  }, [isAuthed, loadFolders, refreshKey]);

  useEffect(() => {
    if (!isAuthed || !isAdminish) return;
    loadAudit();
  }, [isAuthed, isAdminish, loadAudit, refreshKey]);

  const login = async (email, password) => {
    try {
      const { data } = await axios.post(`${API}/api/login`, {
        email,
        password,
      });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setPage("dashboard");
      notify("success", `Welcome back, ${data.user.name?.split(" ")[0] || "User"}!`);
    } catch (error) {
      handleAxiosError(error, "Login failed. Check your credentials.");
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await axios.post(`${API}/api/logout`, {}, { headers: authHeaders });
      }
    } catch {
      // Logout should still clear the local session.
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setToken(null);
      setUser(null);
      setProfileOpen(false);
      setMobileNav(false);
    }
  };

  const openDocument = async (document, mode) => {
    try {
      const endpoint = mode === "view" ? "view" : "download";
      const { data } = await axios.get(
        `${API}/api/documents/${document.id}/${endpoint}`,
        {
          headers: authHeaders,
          responseType: "blob",
        }
      );

      const url = URL.createObjectURL(data);
      if (mode === "view") {
        const newTab = window.open(url, "_blank", "noopener,noreferrer");
        if (!newTab) {
          notify("error", "Your browser blocked the document window. Allow pop-ups and try again.");
        }
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = `${document.title || "document"}${document.file_type || ""}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      handleAxiosError(error, `Could not ${mode} document`);
    }
  };

  const deleteDocument = async (document) => {
    const confirmed = window.confirm(
      `Delete “${document.title}”? Only the original uploader can do this.`
    );
    if (!confirmed) return;

    try {
      await axios.delete(`${API}/api/documents/${document.id}`, {
        headers: authHeaders,
      });
      notify("success", "Document deleted successfully.");
      setRefreshKey((value) => value + 1);
    } catch (error) {
      handleAxiosError(error, "Could not delete document");
    }
  };

  const changePage = (next) => {
    setPage(next);
    setMobileNav(false);
    setProfileOpen(false);
  };

  if (!isAuthed) {
    return <LoginScreen onLogin={login} notify={notify} toast={toast} />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        changePage={changePage}
        canAudit={isAdminish}
        open={mobileNav}
        close={() => setMobileNav(false)}
      />

      {mobileNav && <button className="mobile-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}

      <div className="app-main">
        <Topbar
          user={user}
          profileOpen={profileOpen}
          setProfileOpen={setProfileOpen}
          onMenu={() => setMobileNav(true)}
          onUpload={() => setUploadOpen(true)}
          canUpload={canUpload}
          onLogout={logout}
        />

        <div className="page-wrap">
          {page === "dashboard" && (
            <DashboardPage
              user={user}
              documents={documents}
              folders={folders}
              auditLogs={auditLogs}
              canUpload={canUpload}
              onUpload={() => setUploadOpen(true)}
              onView={(doc) => openDocument(doc, "view")}
              onDownload={(doc) => openDocument(doc, "download")}
              onDelete={deleteDocument}
              onDocuments={() => changePage("documents")}
              loading={loadingDocs}
            />
          )}

          {page === "documents" && (
            <DocumentsPage
              documents={documents}
              folders={folders}
              search={search}
              setSearch={setSearch}
              category={category}
              setCategory={setCategory}
              folderFilter={folderFilter}
              setFolderFilter={setFolderFilter}
              onUpload={() => setUploadOpen(true)}
              canUpload={canUpload}
              onView={(doc) => openDocument(doc, "view")}
              onDownload={(doc) => openDocument(doc, "download")}
              onDelete={deleteDocument}
              user={user}
              loading={loadingDocs}
            />
          )}

          {page === "folders" && (
            <FoldersPage
              folders={folders}
              documents={documents}
              canCreate={isAdminish}
              onCreate={() => setFolderOpen(true)}
              loading={loadingFolders}
            />
          )}

          {page === "activity" && isAdminish && (
            <AuditPage auditLogs={auditLogs} loading={loadingAudit} />
          )}
        </div>
      </div>

      {uploadOpen && (
        <UploadModal
          token={token}
          folders={folders}
          onClose={() => setUploadOpen(false)}
          onSuccess={() => {
            setUploadOpen(false);
            notify("success", "Document uploaded successfully.");
            setRefreshKey((value) => value + 1);
          }}
          onError={(message) => notify("error", message)}
        />
      )}

      {folderOpen && (
        <FolderModal
          token={token}
          onClose={() => setFolderOpen(false)}
          onSuccess={() => {
            setFolderOpen(false);
            notify("success", "Folder created successfully.");
            setRefreshKey((value) => value + 1);
          }}
          onError={(message) => notify("error", message)}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function LoginScreen({ onLogin, notify, toast }) {
  const [email, setEmail] = useState("admin@unirepo.com");
  const [password, setPassword] = useState("Admin@123");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await onLogin(email, password);
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = (account) => {
    setEmail(account.email);
    setPassword(account.password);
    notify("success", `${account.role} demo credentials loaded.`);
  };

  return (
    <div className="login-screen">
      <div className="login-bg-orb orb-one" />
      <div className="login-bg-orb orb-two" />
      <div className="login-grid-overlay" />

      <div className="login-shell">
        <section className="login-story">
          <div className="story-brand">
            <div className="brand-mark"><ShieldCheck size={21} /></div>
            <div>
              <div className="story-brand-title">UniRepo</div>
              <div className="story-brand-sub">University Repository</div>
            </div>
          </div>

          <div className="story-copy">
            <div className="eyebrow light">SECURE DOCUMENT HUB</div>
            <h1>One trusted place for every university document.</h1>
            <p>
              Centralized storage, hierarchy-based access, standardized folders,
              ownership controls, and a complete audit trail — designed for the university environment.
            </p>
          </div>

          <div className="story-points">
            <StoryPoint icon={ShieldCheck} title="Server-side authorization" copy="Access is enforced before files are served." />
            <StoryPoint icon={Folder} title="Role-aware organization" copy="Folders and documents adapt to the user's hierarchy." />
            <StoryPoint icon={Activity} title="Complete audit trail" copy="Track login, upload, view, download and delete activity." />
          </div>

          <div className="story-footer">IEEE Student Branch Hackathon • PS-1</div>
        </section>

        <section className="login-panel">
          <div className="mobile-logo">
            <div className="brand-mark"><ShieldCheck size={20} /></div>
            <strong>UniRepo</strong>
          </div>

          <div className="login-heading">
            <div className="eyebrow">UNIVERSITY ACCESS</div>
            <h2>Welcome back</h2>
            <p>Sign in with your university credentials to continue.</p>
          </div>

          <form onSubmit={submit} className="auth-form">
            <div className="field-group">
              <label htmlFor="email">University email</label>
              <div className="input-wrap">
                <UsersRound size={17} />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@university.edu"
                  required
                />
              </div>
            </div>

            <div className="field-group">
              <label htmlFor="password">Password</label>
              <div className="input-wrap">
                <ShieldCheck size={17} />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  className="input-icon-button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button className="primary-btn login-submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
              {!busy && <ArrowRight size={17} />}
            </button>
          </form>

          <div className="demo-section">
            <div className="demo-label">Quick demo access</div>
            <div className="demo-buttons">
              {DEMO_USERS.map((account) => (
                <button key={account.role} onClick={() => fillDemo(account)} className="demo-btn">
                  <span>{account.role}</span>
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
            <div className="demo-hint">For the hackathon demo only. Change credentials before real deployment.</div>
          </div>

          <div className="login-trust">
            <BadgeCheck size={15} />
            Protected by role and hierarchy-based access control
          </div>
        </section>
      </div>

      {toast && <Toast toast={toast} onClose={() => {}} />}
    </div>
  );
}

function StoryPoint({ icon: Icon, title, copy }) {
  return (
    <div className="story-point">
      <div className="story-point-icon"><Icon size={16} /></div>
      <div>
        <strong>{title}</strong>
        <span>{copy}</span>
      </div>
    </div>
  );
}

function Sidebar({ page, changePage, canAudit, open, close }) {
  return (
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <div className="sidebar-top">
        <div className="sidebar-brand">
          <div className="brand-mark"><ShieldCheck size={21} /></div>
          <div>
            <strong>UniRepo</strong>
            <span>University Repository</span>
          </div>
          <button className="mobile-close" onClick={close} aria-label="Close menu">
            <X size={19} />
          </button>
        </div>

        <div className="nav-label">WORKSPACE</div>
        <nav>
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            if (id === "activity" && !canAudit) return null;
            return (
              <button
                key={id}
                className={`nav-link ${page === id ? "active" : ""}`}
                onClick={() => changePage(id)}
              >
                <Icon size={18} />
                <span>{label}</span>
                {id === "documents" && <span className="nav-arrow">→</span>}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="sidebar-bottom">
        <div className="sidebar-security">
          <div className="security-icon"><ShieldCheck size={17} /></div>
          <div>
            <strong>Repository protected</strong>
            <span>Server-side file authorization is active.</span>
          </div>
        </div>
        <div className="sidebar-version">UniRepo MVP • 2026</div>
      </div>
    </aside>
  );
}

function Topbar({ user, profileOpen, setProfileOpen, onMenu, onUpload, canUpload, onLogout }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="menu-button" onClick={onMenu} aria-label="Open navigation">
          <Menu size={21} />
        </button>
        <div className="topbar-title-wrap">
          <div className="eyebrow">UNIVERSITY DOCUMENT HUB</div>
          <h1>Repository workspace</h1>
        </div>
      </div>

      <div className="topbar-actions">
        {canUpload && (
          <button className="primary-btn compact" onClick={onUpload}>
            <Upload size={16} />
            Upload
          </button>
        )}

        <div className="profile-wrap">
          <button className="profile-button" onClick={() => setProfileOpen((value) => !value)}>
            <div className="avatar">{initials(user?.name)}</div>
            <div className="profile-copy">
              <strong>{user?.name}</strong>
              <span>{user?.role}</span>
            </div>
            <ChevronDown size={15} className={profileOpen ? "rotate" : ""} />
          </button>

          {profileOpen && (
            <div className="profile-menu">
              <div className="profile-menu-head">
                <div className="avatar large">{initials(user?.name)}</div>
                <div>
                  <strong>{user?.name}</strong>
                  <span>{user?.email}</span>
                </div>
              </div>
              <div className="profile-stat">
                <span>Highest hierarchy</span>
                <strong>{levelLabel(user?.hierarchyLevel)}</strong>
              </div>
              <button onClick={onLogout} className="menu-logout">
                <LogOut size={16} /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function DashboardPage({ user, documents, folders, auditLogs, canUpload, onUpload, onView, onDownload, onDelete, onDocuments, loading }) {
  const applicable = folders.filter((folder) => folder.applicable).length;
  const recent = documents.slice(0, 5);
  const views = auditLogs.filter((item) => item.action === "VIEW").length;
  const denied = auditLogs.filter((item) => item.action.includes("DENIED")).length;

  return (
    <div className="page-content">
      <div className="welcome-row">
        <div>
          <div className="eyebrow">GOOD MORNING</div>
          <h2>{user?.name?.split(" ")[0]}, your repository is ready.</h2>
          <p>Browse only the documents your role and university hierarchy authorize you to access.</p>
        </div>
        <div className="hero-date"><Clock3 size={15} /> {new Date().toLocaleDateString([], { weekday: "long", day: "2-digit", month: "short" })}</div>
      </div>

      <section className="hero-banner">
        <div className="hero-banner-content">
          <div className="eyebrow light">SECURE UNIVERSITY REPOSITORY</div>
          <h3>Documents where they belong. Access where it is allowed.</h3>
          <p>Standardized folders, hierarchy-aware authorization and a traceable activity trail — all inside one workspace.</p>
          <div className="hero-actions">
            <button className="hero-primary" onClick={onDocuments}>Explore documents <ArrowRight size={16} /></button>
            {canUpload && <button className="hero-secondary" onClick={onUpload}><Upload size={16} /> Upload document</button>}
          </div>
        </div>
        <div className="hero-art">
          <div className="hero-ring ring-one" />
          <div className="hero-ring ring-two" />
          <div className="hero-lock"><ShieldCheck size={60} /></div>
          <div className="hero-float-card card-a"><FileText size={16} /><span>Academics</span><b>Protected</b></div>
          <div className="hero-float-card card-b"><Activity size={16} /><span>Audit trail</span><b>Live</b></div>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard icon={FileText} label="Accessible documents" value={documents.length} detail="Visible to your current access level" />
        <MetricCard icon={Folder} label="Applicable folders" value={applicable} detail="Folders available for your role" />
        <MetricCard icon={ShieldCheck} label="Hierarchy level" value={user?.hierarchyLevel ?? 0} detail={levelLabel(user?.hierarchyLevel)} />
        <MetricCard icon={Activity} label="Tracked activities" value={auditLogs.length || "—"} detail={`${views} views • ${denied} denied`} />
      </section>

      <div className="section-heading-row">
        <div>
          <div className="eyebrow">REPOSITORY</div>
          <h3>Recent documents</h3>
          <p>Latest documents you are authorized to access.</p>
        </div>
        <button className="ghost-btn" onClick={onDocuments}>View all <ArrowRight size={15} /></button>
      </div>

      <DocumentTable
        documents={recent}
        user={user}
        onView={onView}
        onDownload={onDownload}
        onDelete={onDelete}
        loading={loading}
        compact
      />
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, detail }) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <div className="metric-icon"><Icon size={17} /></div>
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function DocumentsPage({ documents, folders, search, setSearch, category, setCategory, folderFilter, setFolderFilter, onUpload, canUpload, onView, onDownload, onDelete, user, loading }) {
  const categories = [...new Set(documents.map((doc) => doc.category).filter(Boolean))];

  return (
    <div className="page-content">
      <div className="section-heading-row page-heading">
        <div>
          <div className="eyebrow">DOCUMENT LIBRARY</div>
          <h2>All accessible documents</h2>
          <p>Search, filter, view and download within your authorized scope.</p>
        </div>
        {canUpload && <button className="primary-btn" onClick={onUpload}><Upload size={16} /> Upload document</button>}
      </div>

      <section className="filter-bar">
        <div className="search-wrap">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by title, category or department…" />
        </div>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">All categories</option>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)}>
          <option value="">All folders</option>
          {folders.filter((folder) => folder.applicable).map((folder) => (
            <option key={folder.id} value={folder.id}>{folder.folder_name}</option>
          ))}
        </select>
      </section>

      <div className="list-summary">
        <span><strong>{documents.length}</strong> document{documents.length === 1 ? "" : "s"}</span>
        <span className="summary-dot" />
        <span>Sorted by newest</span>
      </div>

      <DocumentTable
        documents={documents}
        user={user}
        onView={onView}
        onDownload={onDownload}
        onDelete={onDelete}
        loading={loading}
      />
    </div>
  );
}

function DocumentTable({ documents, user, onView, onDownload, onDelete, loading, compact = false }) {
  if (loading) {
    return (
      <div className="table-card loading-card">
        <div className="spinner" />
        <span>Loading repository…</span>
      </div>
    );
  }

  if (!documents.length) {
    return (
      <div className="table-card empty-card">
        <div className="empty-icon"><Archive size={27} /></div>
        <h3>No documents found</h3>
        <p>Try a different filter or upload the first document for this repository.</p>
      </div>
    );
  }

  return (
    <div className={`table-card ${compact ? "compact-table" : ""}`}>
      <div className="table-head table-grid">
        <span>Document</span>
        <span>Category</span>
        <span>Folder</span>
        <span>Owner</span>
        <span>Activity</span>
      </div>

      {documents.map((doc) => {
        const isOwner = Number(doc.uploaded_by) === Number(user?.id);
        const kind = fileKind(doc.file_type);
        return (
          <div className="table-row table-grid" key={doc.id}>
            <div className="doc-cell">
              <div className={`file-badge file-${kind.toLowerCase()}`}>
                {kind === "PDF" ? <FileText size={17} /> : kind === "DOCX" ? <FileType2 size={17} /> : kind === "PPTX" ? <BarChart3 size={17} /> : kind === "XLSX" ? <FileSpreadsheet size={17} /> : <FileText size={17} />}
              </div>
              <div className="doc-copy">
                <strong>{doc.title}</strong>
                <span>{doc.department || "University"} • {kind}</span>
              </div>
            </div>
            <div className="table-secondary">{doc.category || "—"}</div>
            <div className="table-secondary">{doc.folder_name || "Unassigned"}</div>
            <div className="owner-cell">
              <div className="tiny-avatar">{initials(doc.uploaded_by_name || "U")}</div>
              <span>{doc.uploaded_by_name || "—"}</span>
            </div>
            <div className="row-actions">
              <button title="View" onClick={() => onView(doc)}><Eye size={15} /></button>
              <button title="Download" onClick={() => onDownload(doc)}><ArrowDownToLine size={15} /></button>
              {isOwner && <button title="Delete" className="danger" onClick={() => onDelete(doc)}><Trash2 size={15} /></button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FoldersPage({ folders, documents, canCreate, onCreate, loading }) {
  const documentCountByFolder = useMemo(() => {
    const result = {};
    documents.forEach((doc) => {
      if (doc.folder_id) result[doc.folder_id] = (result[doc.folder_id] || 0) + 1;
    });
    return result;
  }, [documents]);

  return (
    <div className="page-content">
      <div className="section-heading-row page-heading">
        <div>
          <div className="eyebrow">FOLDER STRUCTURE</div>
          <h2>Repository folders</h2>
          <p>Standardized university categories with clear applicability for every user.</p>
        </div>
        {canCreate && <button className="primary-btn" onClick={onCreate}><FolderPlus size={16} /> New folder</button>}
      </div>

      {loading ? (
        <div className="table-card loading-card"><div className="spinner" /><span>Loading folders…</span></div>
      ) : (
        <div className="folder-grid">
          {folders.map((folder) => (
            <div className={`folder-tile ${folder.applicable ? "" : "disabled"}`} key={folder.id}>
              <div className="folder-tile-head">
                <div className="folder-icon-wrap"><Folder size={23} /></div>
                <span className={folder.applicable ? "status-pill success" : "status-pill muted"}>
                  {folder.applicable ? "Applicable" : "Not applicable"}
                </span>
              </div>
              <h3>{folder.folder_name}</h3>
              <p>{folder.applicable ? "Available for your current role." : "Defined by the university, not assigned to your role."}</p>
              <div className="folder-footer">
                <span>{documentCountByFolder[folder.id] || 0} documents visible</span>
                {folder.applicable ? <ArrowRight size={15} /> : <CircleAlert size={15} />}
              </div>
            </div>
          ))}
          {canCreate && (
            <button className="folder-create-tile" onClick={onCreate}>
              <div className="folder-create-icon"><Plus size={22} /></div>
              <strong>Create another folder</strong>
              <span>Administration / Dean or higher</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AuditPage({ auditLogs, loading }) {
  return (
    <div className="page-content">
      <div className="section-heading-row page-heading">
        <div>
          <div className="eyebrow">SECURITY & COMPLIANCE</div>
          <h2>Audit activity</h2>
          <p>System-generated records of important repository actions.</p>
        </div>
        <div className="security-banner"><ShieldCheck size={16} /> Admin monitoring enabled</div>
      </div>

      {loading ? (
        <div className="table-card loading-card"><div className="spinner" /><span>Loading audit trail…</span></div>
      ) : (
        <div className="table-card audit-card">
          <div className="audit-grid audit-head">
            <span>User</span>
            <span>Action</span>
            <span>Document / target</span>
            <span>Timestamp</span>
          </div>
          {auditLogs.length ? auditLogs.map((log) => (
            <div className="audit-grid audit-row" key={log.id}>
              <div className="audit-user">
                <div className="tiny-avatar">{initials(log.user_name || "S")}</div>
                <div>
                  <strong>{log.user_name || "System"}</strong>
                  <span>{log.user_role || "—"}</span>
                </div>
              </div>
              <div>
                <ActionBadge action={log.action} />
              </div>
              <span className="audit-target">{log.document_title || "System activity"}</span>
              <span className="audit-time">{formatDate(log.created_at)}</span>
            </div>
          )) : (
            <div className="empty-card inside"><div className="empty-icon"><Activity size={24} /></div><h3>No audit events yet</h3><p>Activity will appear here as users interact with the repository.</p></div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionBadge({ action }) {
  const denied = String(action).includes("DENIED");
  const tone = denied ? "danger" : action === "DOWNLOAD" ? "download" : action === "UPLOAD" ? "upload" : "neutral";
  return <span className={`action-badge ${tone}`}>{action}</span>;
}

function UploadModal({ token, folders, onClose, onSuccess, onError }) {
  const applicable = folders.filter((folder) => folder.applicable);
  const [form, setForm] = useState({
    title: "",
    category: "Academic",
    department: "CSE",
    folder_id: "",
  });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!file) {
      onError("Select a PDF, DOCX, PPTX or XLSX file.");
      return;
    }
    if (!form.folder_id) {
      onError("Select an applicable folder.");
      return;
    }

    const allowed = [".pdf", ".docx", ".pptx", ".xlsx"];
    const extension = `.${file.name.split(".").pop().toLowerCase()}`;
    if (!allowed.includes(extension)) {
      onError("Only PDF, DOCX, PPTX and XLSX files are allowed.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      onError("File size cannot exceed 20 MB.");
      return;
    }

    const payload = new FormData();
    payload.append("title", form.title);
    payload.append("category", form.category);
    payload.append("department", form.department);
    payload.append("folder_id", form.folder_id);
    payload.append("document", file);

    setBusy(true);
    try {
      await axios.post(`${API}/api/documents`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      onSuccess();
    } catch (error) {
      onError(error.response?.data?.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Upload document" subtitle="Add a secure university document to the repository." onClose={onClose}>
      <form onSubmit={submit} className="modal-form">
        <Field label="Document title">
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Mid-Sem Examination Schedule" required />
        </Field>
        <div className="two-col">
          <Field label="Category">
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
              <option>Academic</option>
              <option>Examination</option>
              <option>Finance</option>
              <option>Research</option>
              <option>Circular</option>
              <option>Proposal</option>
              <option>Training</option>
            </select>
          </Field>
          <Field label="Department">
            <input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} placeholder="CSE" />
          </Field>
        </div>
        <Field label="Repository folder">
          <select value={form.folder_id} onChange={(event) => setForm({ ...form, folder_id: event.target.value })} required>
            <option value="">Select applicable folder</option>
            {applicable.map((folder) => <option key={folder.id} value={folder.id}>{folder.folder_name}</option>)}
          </select>
        </Field>
        <Field label="Document file">
          <label className="dropzone">
            <Upload size={23} />
            <strong>{file ? file.name : "Choose a file"}</strong>
            <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "PDF, DOCX, PPTX or XLSX • max 20 MB"}</span>
            <input type="file" accept=".pdf,.docx,.pptx,.xlsx" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </label>
        </Field>
        <div className="permission-note"><ShieldCheck size={15} /><span>Access is enforced by the server using your hierarchy and folder permissions.</span></div>
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-btn" disabled={busy}>{busy ? "Uploading…" : "Upload document"}<Upload size={15} /></button>
        </div>
      </form>
    </Modal>
  );
}

function FolderModal({ token, onClose, onSuccess, onError }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await axios.post(`${API}/api/folders`, {
        folder_name: name,
        applicable_roles: ["Teaching Staff", "Non-Teaching Staff"],
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      onSuccess();
    } catch (error) {
      onError(error.response?.data?.message || "Folder creation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Create folder" subtitle="Add a standardized folder for the university repository." onClose={onClose}>
      <form onSubmit={submit} className="modal-form">
        <Field label="Folder name">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Accreditation" required />
        </Field>
        <div className="permission-note"><ShieldCheck size={15} /><span>This action is restricted to Administration / Dean level or higher.</span></div>
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-btn" disabled={busy}>{busy ? "Creating…" : "Create folder"}<FolderPlus size={15} /></button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }) {
  return <div className="field-group"><label>{label}</label>{children}</div>;
}

function Modal({ title, subtitle, onClose, children }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div><div className="eyebrow">REPOSITORY ACTION</div><h2>{title}</h2><p>{subtitle}</p></div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal"><X size={19} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Toast({ toast, onClose }) {
  return (
    <div className={`toast ${toast.type}`}>
      {toast.type === "success" ? <BadgeCheck size={17} /> : <CircleAlert size={17} />}
      <span>{toast.message}</span>
      <button onClick={onClose}><X size={14} /></button>
    </div>
  );
}

export default App;
