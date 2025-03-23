// تحميل المكتبات
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();

// إعداد التطبيق
const app = express();
app.use(cors());
app.use(bodyParser.json());

// الاتصال بقاعدة البيانات
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// التأكد من الاتصال
db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
  } else {
    console.log("Database connection successful!");
  }
});

// نقطة اختبار
app.get("/", (req, res) => {
  res.send("The server is working");
});

// عرض كل المطاعم
app.get("/venues", (req, res) => {
  const sql = "SELECT * FROM venues";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching venues:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(result);
  });
});

// عرض عناصر المنيو لمطعم معين
app.get("/menu_items/:venue_id", (req, res) => {
  const venueId = req.params.venue_id;
  const sql = `
    SELECT id, name, price, image_url, category
    FROM menu_items
    WHERE venue_id = ?
  `;
  db.query(sql, [venueId], (err, result) => {
    if (err) {
      console.error("Error fetching menu items:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(result);
  });
});

// نظرة عامة على الطابور
app.get("/queue_overview/:venue_id", (req, res) => {
  const venueId = req.params.venue_id;
  const sql = `
    SELECT COUNT(*) AS waiting_count
    FROM queues
    WHERE venue_id = ? AND status = 'waiting'
  `;
  db.query(sql, [venueId], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Database error" });
    }

    const waitingCount = result[0].waiting_count;
    const estimatedWait = waitingCount * 2;

    res.json({
      venue_id: venueId,
      waiting_count: waitingCount,
      estimated_wait_minutes: estimatedWait,
    });
  });
});

app.get("/queue_status/:user_id/:venue_id", (req, res) => {
  const { user_id, venue_id } = req.params;

  // نجيب موقع المستخدم في الطابور
  const userSql = `
      SELECT position
      FROM queues
      WHERE user_id = ? AND venue_id = ? AND status = 'waiting'
    `;

  db.query(userSql, [user_id, venue_id], (err, userResult) => {
    if (err) {
      console.error("Error getting user position:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (userResult.length === 0) {
      return res.status(404).json({ message: "User is not in the queue." });
    }

    const userPosition = userResult[0].position;

    // نجيب كم شخص قبله
    const countSql = `
        SELECT COUNT(*) AS people_ahead
        FROM queues
        WHERE venue_id = ? AND status = 'waiting' AND position < ?
      `;

    db.query(countSql, [venue_id, userPosition], (err, countResult) => {
      if (err) {
        console.error("Error counting people ahead:", err);
        return res.status(500).json({ message: "Database error" });
      }

      const peopleAhead = countResult[0].people_ahead;
      const estimatedWait = peopleAhead * 2; // مثلاً 2 دقيقة لكل شخص

      res.json({
        position: userPosition,
        people_ahead: peopleAhead,
        estimated_wait_minutes: estimatedWait,
      });
    });
  });
});

app.post("/leave_queue", (req, res) => {
  const { user_id, venue_id } = req.body;

  const sql = `
      UPDATE queues
      SET status = 'done'
      WHERE user_id = ? AND venue_id = ? AND status = 'waiting'
    `;

  db.query(sql, [user_id, venue_id], (err, result) => {
    if (err) {
      console.error("Error leaving queue:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "User not found in the queue or already left" });
    }

    res.json({ message: "You have left the queue" });
  });
});

// الانضمام للطابور
app.post("/join_queue", (req, res) => {
  const { user_id, venue_id } = req.body;

  const getPositionSql = `
    SELECT COUNT(*) AS count 
    FROM queues 
    WHERE venue_id = ? AND status = 'waiting'
  `;

  db.query(getPositionSql, [venue_id], (err, result) => {
    if (err) {
      console.error("Error calculating position:", err);
      return res.status(500).json({ message: "Database error" });
    }

    const position = result[0].count + 1;

    const insertSql = `
      INSERT INTO queues (user_id, venue_id, position, status)
      VALUES (?, ?, ?, 'waiting')
    `;

    db.query(insertSql, [user_id, venue_id, position], (err, result) => {
      if (err) {
        console.error("Error joining queue:", err);
        return res.status(500).json({ message: "Database error" });
      }

      res.json({ message: "You have joined the queue!", position });
    });
  });
});

// تشغيل الخادم
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`The server is running http://localhost:${PORT}`);
});
