const express = require("express");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 8080;
const sessions = new Map();
const uploadDirectory = path.join(__dirname, "public", "uploads");
fs.mkdirSync(uploadDirectory, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${extension}`);
    }
  }),
  fileFilter: (req, file, callback) => {
    callback(null, file.mimetype.startsWith("image/"));
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});
const demoUser = {
  id: 1,
  name: "Admin User",
  email: "admin@adisl.com",
  password: "admin123",
  role: "Administrator"
};

const demoStaffUser = {
  id: 2,
  name: "Sales User",
  email: "sales@adisl.com",
  password: "sales123",
  role: "Staff"
};

const dataDirectory = path.join(__dirname, "data");
const dataFilePath = path.join(dataDirectory, "store.json");
fs.mkdirSync(dataDirectory, { recursive: true });

function buildExactTimestamps(date = new Date()) {
  const iso = date.toISOString();
  const displayDate = date.toLocaleDateString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
  const displayTime = date.toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });

  return {
    timestamp: iso,
    date: displayDate,
    time: displayTime
  };
}

function isToday(record) {
  if (record && record.timestamp) {
    const recordDate = new Date(record.timestamp);
    if (!Number.isNaN(recordDate.getTime())) {
      return recordDate.toDateString() === new Date().toDateString();
    }
  }

  return record && record.date === buildExactTimestamps().date;
}

const defaultProducts = [
  { id: 1, name: "Laptop", category: "Electronics", supplier: "Dell Supplies", price: 250000, stock: 50, icon: "💻", lastStockChange: 0 },
  { id: 2, name: "Running Shoes", category: "Footwear", supplier: "Nike Ltd", price: 45000, stock: 8, icon: "👟", lastStockChange: 0 },
  { id: 3, name: "Backpack", category: "Bags", supplier: "Global Traders", price: 25000, stock: 30, icon: "🎒", lastStockChange: 0 },
  { id: 4, name: "Smart Watch", category: "Electronics", supplier: "Tech World", price: 80000, stock: 15, icon: "⌚", lastStockChange: 0 },
  { id: 5, name: "Water Bottle", category: "Accessories", supplier: "Home Essentials", price: 12000, stock: 45, icon: "🧴", lastStockChange: 0 }
];

const defaultOrders = [
  { id: "TRX1001", customer: "John Doe", amount: 45000, status: "Completed", paymentMethod: "Card", date: "Apr 27, 2025", time: "09:45 AM", reference: "INV-2041" },
  { id: "TRX1002", customer: "Sarah Johnson", amount: 32500, status: "Completed", paymentMethod: "Transfer", date: "Apr 26, 2025", time: "11:20 AM", reference: "INV-2039" },
  { id: "TRX1003", customer: "Michael Brown", amount: 78000, status: "Pending", paymentMethod: "Wallet", date: "Apr 25, 2025", time: "03:10 PM", reference: "INV-2035" },
  { id: "TRX1004", customer: "Grace Wilson", amount: 15600, status: "Completed", paymentMethod: "Card", date: "Apr 24, 2025", time: "08:55 AM", reference: "INV-2031" },
  { id: "TRX1005", customer: "David Kim", amount: 92000, status: "Refunded", paymentMethod: "Bank", date: "Apr 23, 2025", time: "06:40 PM", reference: "INV-2028" }
];

const defaultSuppliers = [
  { id: 1, name: "Dell Supplies", email: "sales@dellsupplies.com", phone: "+234 801 234 5678", products: 24 },
  { id: 2, name: "Nike Ltd", email: "orders@nikeltd.com", phone: "+234 802 345 6789", products: 18 },
  { id: 3, name: "Global Traders", email: "hello@globaltraders.com", phone: "+234 803 456 7890", products: 31 },
  { id: 4, name: "Tech World", email: "support@techworld.com", phone: "+234 804 567 8901", products: 27 }
];

const defaultUsers = [demoUser, demoStaffUser];

function loadStore() {
  try {
    if (!fs.existsSync(dataFilePath)) {
      return { products: [...defaultProducts], orders: [...defaultOrders], saleRecords: [], returns: [], suppliers: [...defaultSuppliers], users: [...defaultUsers] };
    }

    const parsed = JSON.parse(fs.readFileSync(dataFilePath, "utf8"));
    return {
      products: Array.isArray(parsed.products) ? parsed.products : [...defaultProducts],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [...defaultOrders],
      saleRecords: Array.isArray(parsed.saleRecords) ? parsed.saleRecords : [],
      returns: Array.isArray(parsed.returns) ? parsed.returns : [],
      suppliers: Array.isArray(parsed.suppliers) ? parsed.suppliers : [...defaultSuppliers],
      users: Array.isArray(parsed.users) ? parsed.users : [...defaultUsers]
    };
  } catch (error) {
    return { products: [...defaultProducts], orders: [...defaultOrders], saleRecords: [], returns: [], suppliers: [...defaultSuppliers], users: [...defaultUsers] };
  }
}

const users = [...defaultUsers];
sessions.set("demo-session", demoUser);

const persistedStore = loadStore();
let products = persistedStore.products;
let orders = persistedStore.orders;
let saleRecords = persistedStore.saleRecords;
let returns = persistedStore.returns;
let suppliers = persistedStore.suppliers;
let usersState = persistedStore.users;
users.splice(0, users.length, ...usersState);

const DB_CONFIG = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "stockpro_local"
};

let mysqlPool = null;
let useMysql = false;

async function ensureMysqlDatabase() {
  const adminConnection = await mysql.createConnection({
    host: DB_CONFIG.host,
    port: DB_CONFIG.port,
    user: DB_CONFIG.user,
    password: DB_CONFIG.password
  });

  try {
    await adminConnection.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\``);
  } finally {
    await adminConnection.end();
  }

  mysqlPool = mysql.createPool({
    ...DB_CONFIG,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  useMysql = true;

  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id BIGINT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(255),
      supplier VARCHAR(255),
      price DECIMAL(12,2) NOT NULL,
      stock INT NOT NULL,
      icon VARCHAR(20),
      image VARCHAR(255),
      lastStockChange INT DEFAULT 0
    )
  `);

  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id VARCHAR(50) PRIMARY KEY,
      customer VARCHAR(255),
      amount DECIMAL(12,2) NOT NULL,
      paymentMethod VARCHAR(50),
      status VARCHAR(50),
      date VARCHAR(100),
      time VARCHAR(50),
      reference VARCHAR(100),
      createdBy BIGINT
    )
  `);
  await mysqlPool.query("ALTER TABLE orders ADD COLUMN createdBy BIGINT").catch(error => {
    if (error.code !== "ER_DUP_FIELDNAME") throw error;
  });

  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS sale_records (
      id VARCHAR(50) PRIMARY KEY,
      customer VARCHAR(255),
      amount DECIMAL(12,2) NOT NULL,
      paymentMethod VARCHAR(50),
      status VARCHAR(50),
      date VARCHAR(100),
      time VARCHAR(50),
      reference VARCHAR(100),
      items JSON
    )
  `);
}

async function loadMysqlState() {
  if (!mysqlPool) return null;

  const [productRows] = await mysqlPool.query("SELECT * FROM products ORDER BY id ASC");
  const [orderRows] = await mysqlPool.query("SELECT * FROM orders ORDER BY id DESC");
  const [saleRows] = await mysqlPool.query("SELECT * FROM sale_records ORDER BY id DESC");

  return {
    products: productRows.map(row => ({
      ...row,
      price: Number(row.price),
      stock: Number(row.stock),
      lastStockChange: Number(row.lastStockChange || 0)
    })),
    orders: orderRows.map(row => ({
      ...row,
      amount: Number(row.amount),
      createdBy: row.createdBy === null ? null : Number(row.createdBy)
    })),
    saleRecords: saleRows.map(row => ({
      ...row,
      amount: Number(row.amount),
      items: Array.isArray(row.items) ? row.items : JSON.parse(row.items || "[]")
    })),
    returns: []
  };
}

async function persistMysqlState() {
  if (!mysqlPool) return;

  await mysqlPool.query("DELETE FROM products");
  await mysqlPool.query("DELETE FROM orders");
  await mysqlPool.query("DELETE FROM sale_records");

  if (products.length) {
    await mysqlPool.query(
      "INSERT INTO products (id, name, category, supplier, price, stock, icon, image, lastStockChange) VALUES ?",
      [products.map(product => [
        product.id,
        product.name,
        product.category || "",
        product.supplier || "",
        Number(product.price),
        Number(product.stock),
        product.icon || "📦",
        product.image || null,
        Number(product.lastStockChange || 0)
      ])]
    );
  }

  if (orders.length) {
    await mysqlPool.query(
      "INSERT INTO orders (id, customer, amount, paymentMethod, status, date, time, reference, createdBy) VALUES ?",
      [orders.map(order => [
        order.id,
        order.customer || "",
        Number(order.amount),
        order.paymentMethod || "",
        order.status || "Completed",
        order.date || "",
        order.time || "",
        order.reference || "",
        order.createdBy ?? null
      ])]
    );
  }

  if (saleRecords.length) {
    await mysqlPool.query(
      "INSERT INTO sale_records (id, customer, amount, paymentMethod, status, date, time, reference, items) VALUES ?",
      [saleRecords.map(record => [
        record.id,
        record.customer || "",
        Number(record.amount),
        record.paymentMethod || "",
        record.status || "Completed",
        record.date || "",
        record.time || "",
        record.reference || "",
        JSON.stringify(record.items || [])
      ])]
    );
  }
}

async function initializePersistence() {
  try {
    await ensureMysqlDatabase();
    const mysqlState = await loadMysqlState();
    if (mysqlState && Array.isArray(mysqlState.products)) {
      products.splice(0, products.length, ...mysqlState.products);
      orders.splice(0, orders.length, ...mysqlState.orders);
      saleRecords.splice(0, saleRecords.length, ...mysqlState.saleRecords);
      suppliers.splice(0, suppliers.length, ...normalizeSupplierList(mysqlState.suppliers || defaultSuppliers));
    }
  } catch (error) {
    console.warn("MySQL unavailable, falling back to local JSON storage.", error.message);
    useMysql = false;
    mysqlPool = null;
    const fallback = loadStore();
    products.splice(0, products.length, ...fallback.products);
    orders.splice(0, orders.length, ...fallback.orders);
    saleRecords.splice(0, saleRecords.length, ...fallback.saleRecords);
    suppliers.splice(0, suppliers.length, ...fallback.suppliers);
  }
}

function persistStore() {
  try {
    syncSupplierProductCounts();
    usersState = [...users];

    if (useMysql && mysqlPool) {
      persistMysqlState().catch(error => {
        console.warn("MySQL persist failed, falling back to JSON.", error.message);
        useMysql = false;
        fs.writeFileSync(dataFilePath, JSON.stringify({ products, orders, saleRecords, returns, suppliers, users }, null, 2));
      });
      return;
    }

    fs.writeFileSync(dataFilePath, JSON.stringify({ products, orders, saleRecords, returns, suppliers, users }, null, 2));
  } catch (error) {
    console.error("Failed to persist stock data.", error.message);
  }
}

function shutdownGracefully(signal) {
  const signalName = signal || "shutdown";
  try {
    persistStore();
    console.log(`Saved stock data before ${signalName}.`);
  } finally {
    if (process.env.NODE_ENV !== "test") {
      process.exit(0);
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, shutdownGracefully);
}

process.on("exit", () => {
  try {
    if (process.env.NODE_ENV !== "test") {
      persistStore();
    }
  } catch (error) {
    console.error("Exit persistence failed.", error.message);
  }
});

process.on("beforeExit", () => {
  try {
    if (process.env.NODE_ENV !== "test") {
      persistStore();
    }
  } catch (error) {
    console.error("Before-exit persistence failed.", error.message);
  }
});

const dataReady = initializePersistence();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(async (req, res, next) => {
  try {
    await dataReady;
    next();
  } catch (error) {
    next();
  }
});

function normalizeSupplierList(records) {
  if (!Array.isArray(records)) return [];
  return records.map((supplier, index) => ({
    id: supplier.id ?? index + 1,
    name: String(supplier.name || "").trim(),
    email: String(supplier.email || "").trim(),
    phone: String(supplier.phone || "").trim(),
    products: Number(supplier.products || 0)
  })).filter(supplier => supplier.name);
}

function normalizeCollection(records) {
  if (!Array.isArray(records)) return [];

  const flattened = [];
  for (const entry of records) {
    if (Array.isArray(entry)) {
      flattened.push(...normalizeCollection(entry));
    } else if (entry && typeof entry === "object") {
      flattened.push(entry);
    }
  }

  return flattened;
}

function normalizeState() {
  products.splice(0, products.length, ...normalizeCollection(products));
  orders.splice(0, orders.length, ...normalizeCollection(orders));
  saleRecords.splice(0, saleRecords.length, ...normalizeCollection(saleRecords));
  returns.splice(0, returns.length, ...normalizeCollection(returns));
  suppliers.splice(0, suppliers.length, ...normalizeSupplierList(suppliers));
}

function syncSupplierProductCounts() {
  const counts = new Map();

  for (const product of products) {
    const supplierName = String(product.supplier || "").trim();
    if (!supplierName) continue;
    counts.set(supplierName, (counts.get(supplierName) || 0) + 1);
  }

  for (const supplier of suppliers) {
    supplier.products = counts.get(supplier.name) || 0;
  }
}

function getVisibleRecords(req, records) {
  if (!req || !req.user || req.user.role === "Administrator") return records;
  const userId = Number(req.user.id);
  return (Array.isArray(records) ? records : []).filter(record => Number(record.createdBy) === userId);
}

function getTopSellingProducts(records, catalog = products) {
  const totals = new Map();

  for (const record of Array.isArray(records) ? records : []) {
    const items = Array.isArray(record.items) ? record.items : [];

    for (const item of items) {
      const name = String(item.name || "").trim();
      if (!name) continue;

      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.price || 0);
      const revenue = Number(item.total || quantity * unitPrice);

      const existing = totals.get(name) || {
        name,
        quantity: 0,
        revenue: 0,
        image: null,
        icon: "📦"
      };

      existing.quantity += quantity;
      existing.revenue += revenue;

      const productMatch = (Array.isArray(catalog) ? catalog : []).find(product => product.name && product.name.toLowerCase() === name.toLowerCase());
      if (productMatch) {
        existing.image = productMatch.image || existing.image;
        existing.icon = productMatch.icon || existing.icon;
      }

      totals.set(name, existing);
    }
  }

  return [...totals.values()]
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, 5)
    .map(item => ({
      ...item,
      quantity: Number(item.quantity || 0),
      revenue: Number(item.revenue || 0)
    }));
}

function getStaffName(userId) {
  const staff = users.find(user => Number(user.id) === Number(userId));
  return staff ? staff.name : "Legacy / unknown";
}

const adminNavItems = [
  { label: "Dashboard", href: "/", icon: "grid" },
  { label: "Products", href: "/products", icon: "box" },
  { label: "Orders", href: "/orders", icon: "cart" },
  { label: "Suppliers", href: "/suppliers", icon: "truck" },
  { label: "Users", href: "/users", icon: "user" },
  { label: "Profile", href: "/profile", icon: "user" }
];

const salesNavItems = [
  { label: "Sales", href: "/", icon: "grid" },
  { label: "Products", href: "/products", icon: "box" },
  { label: "Transactions", href: "/orders", icon: "cart" },
  { label: "Profile", href: "/profile", icon: "user" }
];

app.locals.formatNaira = value =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(value);

function renderPage(req, res, view, data = {}) {
  const isAdmin = req.user && req.user.role === "Administrator";
  const currentUser = req.user || { name: "User", role: "Staff" };
  const safeReturns = Array.isArray(data.returns) ? data.returns : [];

  res.locals.currentUser = currentUser;
  res.locals.returns = safeReturns;
  res.render(view, {
    ...data,
    returns: safeReturns,
    currentPath: req.path,
    navItems: isAdmin ? adminNavItems : salesNavItems,
    isAdmin,
    currentUser
  });
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split("; ").filter(Boolean).map(cookie => {
    const separator = cookie.indexOf("=");
    return [cookie.slice(0, separator), decodeURIComponent(cookie.slice(separator + 1))];
  }));
}

function requireAuth(req, res, next) {
  const user = sessions.get(parseCookies(req).stockpro_session);
  if (user) {
    req.user = user;
    return next();
  }

  const redirect = encodeURIComponent(req.originalUrl);
  res.redirect(`/login?redirect=${redirect}`);
}

app.get("/login", (req, res) => {
  if (sessions.has(parseCookies(req).stockpro_session)) {
    return res.redirect(req.query.redirect || "/");
  }

  res.render("login", {
    title: "Sign in",
    redirect: req.query.redirect || "/",
    error: null
  });
});

app.post("/login", (req, res) => {
  const { email, password, redirect = "/" } = req.body;
  const user = users.find(account => account.email === email && account.password === password);

  if (!user) {
    return res.status(401).render("login", {
      title: "Sign in",
      redirect,
      error: "The email or password you entered is incorrect."
    });
  }

  const sessionId = crypto.randomBytes(24).toString("hex");
  sessions.set(sessionId, user);
  res.setHeader("Set-Cookie", `stockpro_session=${sessionId}; HttpOnly; Path=/; SameSite=Lax`);
  res.redirect(redirect.startsWith("/") ? redirect : "/");
});

app.get("/logout", (req, res) => {
  const cookies = parseCookies(req);
  sessions.delete(cookies.stockpro_session);
  res.setHeader("Set-Cookie", "stockpro_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
  res.redirect("/login");
});

app.use(requireAuth);

function requireAdmin(req, res, next) {
  if (req.user.role === "Administrator") return next();
  res.status(403).send("Access denied. This area is for administrators only.");
}

function requireSalesAccess(req, res, next) {
  if (req.user.role !== "Administrator") return next();
  res.status(403).send("Sales portal is only available to staff users.");
}

app.get("/", (req, res) => {
  normalizeState();

  if (req.user.role !== "Administrator") {
    const visibleSales = getVisibleRecords(req, saleRecords);
    const todaysSales = visibleSales.filter(isToday);
    const visibleOrders = getVisibleRecords(req, orders);
    const visibleReturns = getVisibleRecords(req, returns);

    const recentSales = [...visibleSales].slice(0, 5).map(record => ({
      item: Array.isArray(record.items) ? record.items.map(item => item.name).join(", ") : "—",
      amount: Number(record.amount || 0),
      time: record.date,
      payment: record.paymentMethod
    }));

    const totalRevenue = visibleSales.reduce((sum, record) => sum + Number(record.amount || 0), 0);
    const refundTotal = visibleReturns.reduce((sum, record) => sum + Number(record.amount || 0), 0);
    const itemsSold = todaysSales.reduce((sum, record) => sum + (Array.isArray(record.items) ? record.items.reduce((count, item) => count + Number(item.quantity || 0), 0) : 0), 0);
    const returnedItems = visibleReturns.reduce((sum, record) => sum + Number(record.quantity || 0), 0);
    const topSellingProducts = getTopSellingProducts(visibleSales, products);

    return renderPage(req, res, "sales-dashboard", {
      title: "Sales Dashboard",
      products,
      orders: visibleOrders,
      returns: visibleReturns,
      salesStats: {
        todaySales: todaysSales.reduce((sum, record) => sum + Number(record.amount || 0), 0),
        itemsSold,
        cashSales: todaysSales.filter(record => record.paymentMethod === "Card").reduce((sum, record) => sum + Number(record.amount || 0), 0),
        totalRevenue,
        refundTotal,
        returnedItems
      },
      topSellingProducts,
      recentSales,
      saleMessage: req.query.sale === "success" ? "Sale recorded successfully." : req.query.sale === "stock" ? "Not enough stock for that quantity." : null,
      saleTone: req.query.sale === "success" ? "success" : req.query.sale === "stock" ? "error" : null
    });
  }

  const todaysOrders = orders.filter(isToday);
  const liveLowStock = [...products]
    .filter(product => Number(product.stock) >= 0)
    .sort((a, b) => Number(a.stock) - Number(b.stock) || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map(product => ({
      name: product.name,
      category: product.category,
      stock: Number(product.stock)
    }));

  const liveTopStocked = [...products]
    .sort((a, b) => Number(b.stock) - Number(a.stock) || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map(product => ({
      name: product.name,
      category: product.category,
      stock: Number(product.stock),
      icon: product.icon || "📦",
      image: product.image || null
    }));

  const dashboardDate = new Date().toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  renderPage(req, res, "dashboard", {
    title: "Dashboard",
    products,
    orders: todaysOrders,
    currentDateTime: dashboardDate,
    stats: {
      totalProducts: products.length,
      totalStocks: products.reduce((sum, product) => sum + product.stock, 0),
      totalOrders: todaysOrders.length,
      revenue: products.reduce((sum, product) => sum + (product.price * product.stock), 0)
    },
    lowStock: liveLowStock,
    topStocked: liveTopStocked
  });
});

app.get("/products", (req, res) => {
  normalizeState();

  if (req.user.role !== "Administrator") {
    const visibleSales = getVisibleRecords(req, saleRecords);
    const todaysSales = visibleSales.filter(isToday);
    const visibleOrders = getVisibleRecords(req, orders);
    const visibleReturns = getVisibleRecords(req, returns);

    const recentSales = [...visibleSales].slice(0, 5).map(record => ({
      item: Array.isArray(record.items) ? record.items.map(item => item.name).join(", ") : "—",
      amount: Number(record.amount || 0),
      time: record.date,
      payment: record.paymentMethod
    }));

    const totalRevenue = visibleSales.reduce((sum, record) => sum + Number(record.amount || 0), 0);
    const refundTotal = visibleReturns.reduce((sum, record) => sum + Number(record.amount || 0), 0);
    const itemsSold = todaysSales.reduce((sum, record) => sum + (Array.isArray(record.items) ? record.items.reduce((count, item) => count + Number(item.quantity || 0), 0) : 0), 0);
    const returnedItems = visibleReturns.reduce((sum, record) => sum + Number(record.quantity || 0), 0);
    const topSellingProducts = getTopSellingProducts(visibleSales, products);

    return renderPage(req, res, "sales-dashboard", {
      title: "Products",
      products,
      orders: visibleOrders,
      returns: visibleReturns,
      salesStats: {
        todaySales: todaysSales.reduce((sum, record) => sum + Number(record.amount || 0), 0),
        itemsSold,
        cashSales: todaysSales.filter(record => record.paymentMethod === "Card").reduce((sum, record) => sum + Number(record.amount || 0), 0),
        totalRevenue,
        refundTotal,
        returnedItems
      },
      topSellingProducts,
      recentSales,
      saleMessage: null,
      saleTone: null,
      catalogMode: true
    });
  }

  renderPage(req, res, "products", { title: "Products", products });
});

app.get("/orders", (req, res) => {
  const visibleOrders = getVisibleRecords(req, orders);
  renderPage(req, res, "orders", {
    title: "Transactions",
    orders: visibleOrders.map(order => ({ ...order, staffName: getStaffName(order.createdBy) }))
  });
});

app.get("/orders/download", (req, res) => {
  const visibleOrders = getVisibleRecords(req, orders);
  const includeStaff = req.user.role === "Administrator";
  const rows = [
    ["Transaction ID", "Customer", "Amount", "Payment Method", "Status", ...(includeStaff ? ["Staff"] : []), "Date", "Time", "Reference"],
    ...visibleOrders.map(order => [
      order.id,
      order.customer,
      String(order.amount),
      order.paymentMethod,
      order.status,
      ...(includeStaff ? [getStaffName(order.createdBy)] : []),
      order.date,
      order.time || "",
      order.reference
    ])
  ];

  const csv = rows.map(row => row.map(value => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="transactions.csv"');
  res.send(csv);
});

app.get("/returns/download", (req, res) => {
  normalizeState();
  const visibleReturns = getVisibleRecords(req, returns);
  const rows = [
    ["Return ID", "Item", "Quantity", "Amount", "Reason", "Date", "Time", "Status"],
    ...visibleReturns.map(record => [
      record.id,
      record.itemName,
      String(record.quantity || 0),
      String(record.amount || 0),
      record.reason || "",
      record.date,
      record.time || "",
      record.status || "Returned"
    ])
  ];

  const content = [
    "Return Record",
    "============",
    "",
    ...rows.map(row => row.join(" | ")),
    "",
    `Recorded returns: ${visibleReturns.length}`
  ].join("\n");

  res.setHeader("Content-Type", "application/msword");
  res.setHeader("Content-Disposition", 'attachment; filename="return-records.doc"');
  res.send(content);
});

app.get("/suppliers", requireAdmin, (req, res) => {
  normalizeState();
  syncSupplierProductCounts();
  renderPage(req, res, "suppliers", { title: "Suppliers", suppliers });
});

app.post("/suppliers/create", requireAdmin, (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim();
  const phone = String(req.body.phone || "").trim();
  const productsCount = Number(req.body.products || 0);

  if (!name || !email || !phone || suppliers.some(supplier => supplier.name.toLowerCase() === name.toLowerCase())) {
    return res.redirect("/suppliers");
  }

  suppliers.push({
    id: Date.now(),
    name,
    email,
    phone,
    products: Number.isFinite(productsCount) ? Math.max(0, productsCount) : 0
  });
  syncSupplierProductCounts();
  persistStore();
  res.redirect("/suppliers");
});

app.get("/suppliers/create", requireAdmin, (req, res) => {
  res.redirect("/suppliers");
});

app.get("/suppliers/:id/edit", requireAdmin, (req, res) => {
  const supplier = suppliers.find(item => item.id === Number(req.params.id));
  if (!supplier) return res.status(404).send("Supplier not found");
  res.redirect(`/suppliers?edit=${encodeURIComponent(supplier.id)}`);
});

app.post("/suppliers/:id/edit", requireAdmin, (req, res) => {
  const supplier = suppliers.find(item => item.id === Number(req.params.id));
  if (!supplier) return res.status(404).send("Supplier not found");

  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim();
  const phone = String(req.body.phone || "").trim();

  if (!name || !email || !phone) return res.redirect("/suppliers");

  const previousName = supplier.name;
  supplier.name = name;
  supplier.email = email;
  supplier.phone = phone;

  if (previousName !== name) {
    products.forEach(product => {
      if (product.supplier === previousName) {
        product.supplier = name;
      }
    });
  }

  syncSupplierProductCounts();
  persistStore();
  res.redirect("/suppliers");
});

app.post("/suppliers/:id/delete", requireAdmin, (req, res) => {
  const supplierIndex = suppliers.findIndex(item => item.id === Number(req.params.id));
  if (supplierIndex === -1) return res.status(404).send("Supplier not found");

  const [supplier] = suppliers.splice(supplierIndex, 1);
  products.forEach(product => {
    if (product.supplier === supplier.name) {
      product.supplier = "Unassigned";
    }
  });
  syncSupplierProductCounts();
  persistStore();
  res.redirect("/suppliers");
});

app.get("/suppliers/:id/delete", requireAdmin, (req, res) => {
  res.redirect("/suppliers");
});

app.get("/profile", (req, res) => {
  renderPage(req, res, "profile", {
    title: "Profile",
    admin: {
      name: req.user ? req.user.name : "Admin User",
      email: req.user ? req.user.email : "admin@stockpro.com",
      role: req.user ? req.user.role : "Administrator"
    }
  });
});

app.get("/users", requireAdmin, (req, res) => {
  renderPage(req, res, "users", {
    title: "Users",
    users,
    queryError: req.query.error === "invalid",
    created: req.query.created === "1",
    userUpdated: req.query.updated === "1",
    userRemoved: req.query.removed === "1"
  });
});

app.post("/sales/record", (req, res) => {
  normalizeState();
  const paymentMethod = req.body.paymentMethod || "Cash";
  const customer = "Walk-in customer";

  let items = [];

  if (req.body.items !== undefined) {
    try {
      const parsedItems = typeof req.body.items === "string" ? JSON.parse(req.body.items) : req.body.items;
      if (Array.isArray(parsedItems)) {
        items = parsedItems.map(item => ({
          id: Number(item.productId ?? item.id),
          quantity: Number(item.quantity || 0)
        })).filter(entry => Number.isFinite(entry.id) && entry.id > 0 && Number.isFinite(entry.quantity) && entry.quantity > 0);
      }
    } catch (error) {
      items = [];
    }
  }

  if (!items.length) {
    const productId = Number(req.body.productId);
    const quantity = Number(req.body.quantity);
    if (!productId || !quantity) return res.redirect("/?sale=invalid");
    items = [{ id: productId, quantity }];
  }

  const saleItems = [];
  const validatedItems = [];
  let totalAmount = 0;

  for (const entry of items) {
    const product = products.find(item => item.id === Number(entry.id));
    if (!product) return res.redirect("/?sale=invalid");

    const quantity = Number(entry.quantity || 0);
    if (!quantity || quantity <= 0 || quantity > product.stock) return res.redirect("/?sale=stock");

    const itemTotal = product.price * quantity;
    saleItems.push({
      id: product.id,
      name: product.name,
      quantity,
      price: product.price,
      total: itemTotal
    });

    totalAmount += itemTotal;
    validatedItems.push({ product, quantity });
  }

  for (const item of validatedItems) {
    item.product.lastStockChange = -item.quantity;
    item.product.stock -= item.quantity;
  }

  const transactionId = `TRX${Date.now().toString().slice(-6)}`;
  const now = new Date();
  const exactStamp = buildExactTimestamps(now);

  const saleRecord = {
    id: transactionId,
    customer,
    amount: totalAmount,
    paymentMethod,
    status: "Completed",
    date: exactStamp.date,
    time: exactStamp.time,
    timestamp: exactStamp.timestamp,
    reference: `INV-${Date.now().toString().slice(-6)}`,
    items: saleItems,
    createdBy: req.user ? req.user.id : null
  };

  saleRecords.unshift(saleRecord);

  orders.unshift({
    id: transactionId,
    customer,
    amount: totalAmount,
    status: "Completed",
    paymentMethod,
    date: exactStamp.date,
    time: exactStamp.time,
    timestamp: exactStamp.timestamp,
    reference: saleRecord.reference,
    createdBy: req.user ? req.user.id : null
  });

  persistStore();
  res.redirect("/?sale=success");
});

app.post("/returns/record", (req, res) => {
  normalizeState();
  const itemName = String(req.body.itemName || "").trim();
  const quantity = Math.max(1, Number(req.body.quantity || 0));
  const amount = Number(req.body.amount || 0);
  const reason = String(req.body.reason || "Not specified").trim();

  if (!itemName || !quantity) {
    return res.redirect("/?sale=invalid");
  }

  const itemProduct = products.find(product => product.name.toLowerCase() === itemName.toLowerCase());
  if (itemProduct) {
    itemProduct.stock += quantity;
    itemProduct.lastStockChange = quantity;
  }

  const returnId = `RET-${Date.now().toString().slice(-6)}`;
  const now = new Date();
  const exactStamp = buildExactTimestamps(now);

  const returnRecord = {
    id: returnId,
    itemName,
    quantity,
    amount,
    reason,
    date: exactStamp.date,
    time: exactStamp.time,
    timestamp: exactStamp.timestamp,
    status: "Returned",
    createdBy: req.user ? req.user.id : null
  };

  const normalizedReturns = normalizeCollection(returns);
  normalizedReturns.unshift(returnRecord);
  returns.splice(0, returns.length, ...normalizedReturns);
  orders.unshift({
    id: returnId,
    customer: itemName,
    amount,
    status: "Refunded",
    paymentMethod: "Return",
    date: exactStamp.date,
    time: exactStamp.time,
    timestamp: exactStamp.timestamp,
    reference: `RTN-${Date.now().toString().slice(-6)}`,
    createdBy: req.user ? req.user.id : null
  });

  persistStore();
  res.redirect("/?sale=success");
});

app.post("/products", (req, res) => {
  res.redirect("/products");
});

app.post("/users/create", requireAdmin, (req, res) => {
  const { name, email, password, role = "Staff" } = req.body;
  if (!name || !email || !password || users.some(user => user.email === email)) {
    return res.redirect("/users?error=invalid");
  }

  const newUser = { id: Date.now(), name, email, password, role };
  users.push(newUser);
  usersState = [...users];
  persistStore();
  res.redirect("/users?created=1");
});

app.post("/users/:id/reset-password", requireAdmin, (req, res) => {
  const user = users.find(account => account.id === Number(req.params.id));
  const password = String(req.body.password || "");

  if (!user || user.role === "Administrator" || user.id === req.user.id || password.length < 6) {
    return res.redirect("/users?error=invalid");
  }

  user.password = password;
  usersState = [...users];
  persistStore();
  res.redirect("/users?updated=1");
});

app.post("/users/:id/delete", requireAdmin, (req, res) => {
  const userIndex = users.findIndex(account => account.id === Number(req.params.id));
  if (userIndex === -1 || users[userIndex].role === "Administrator" || users[userIndex].id === req.user.id) {
    return res.redirect("/users?error=invalid");
  }

  users.splice(userIndex, 1);
  usersState = [...users];
  for (const [sessionId, sessionUser] of sessions.entries()) {
    if (sessionUser.id === Number(req.params.id)) sessions.delete(sessionId);
  }
  persistStore();
  res.redirect("/users?removed=1");
});

app.post("/products/create", requireAdmin, upload.single("image"), (req, res) => {
  products.push({
    id: Date.now(),
    name: req.body.name,
    category: req.body.category,
    supplier: req.body.supplier,
    price: Number(req.body.price),
    stock: Number(req.body.stock),
    icon: "📦",
    image: req.file ? `/uploads/${req.file.filename}` : null
  });
  persistStore();
  res.redirect("/products");
});

app.post("/products/:id/edit", requireAdmin, upload.single("image"), (req, res) => {
  const product = products.find(item => item.id === Number(req.params.id));
  if (!product) return res.status(404).send("Product not found");

  product.name = req.body.name;
  product.category = req.body.category;
  product.supplier = req.body.supplier;
  product.price = Number(req.body.price);
  product.stock = Number(req.body.stock);
  if (req.file) product.image = `/uploads/${req.file.filename}`;
  persistStore();
  res.redirect("/products");
});

app.post("/products/:id/stock", requireAdmin, (req, res) => {
  const product = products.find(item => item.id === Number(req.params.id));
  if (!product) return res.status(404).send("Product not found");

  const action = req.body.action === "remove" ? "remove" : "add";
  const quantity = Math.max(1, Number(req.body.quantity || 1));

  if (action === "remove") {
    product.lastStockChange = -quantity;
    product.stock = Math.max(0, product.stock - quantity);
  } else {
    product.lastStockChange = quantity;
    product.stock += quantity;
  }

  persistStore();
  res.redirect("/products");
});

app.get("/products/:id/stock", requireAdmin, (req, res) => {
  res.redirect("/products");
});

app.post("/products/:id/delete", requireAdmin, (req, res) => {
  const productIndex = products.findIndex(item => item.id === Number(req.params.id));
  if (productIndex === -1) return res.status(404).send("Product not found");
  products.splice(productIndex, 1);
  persistStore();
  res.redirect("/products");
});

app.get("/products/:id/delete", requireAdmin, (req, res) => {
  res.redirect("/products");
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`StockPro running at http://localhost:${PORT}`);
  });
}

module.exports = { app, orders, products, demoUser, sessions, saleRecords, returns, suppliers, users };