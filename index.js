import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = 3000;


const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

db.connect();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
let currentUserId = 1;

let users = [
  { id: 1, name: "Angela", color: "teal" },
  { id: 2, name: "Jack", color: "powderblue" },
];

async function checkVisisted() {
  const result = await db.query(
    "SELECT country_code FROM visited_countries JOIN users ON users.id = user_id WHERE user_id = $1; ",
    [currentUserId]
  );
  let countries = [];
  result.rows.forEach((country) => {
    countries.push(country.country_code);
  });
  return countries;
}

async function getCurrentUser() {
  const result = await db.query("SELECT * FROM users");
  users = result.rows;
  return users.find((user) => user.id == currentUserId);
}

app.get("/", async (req, res) => {
  const countries = await checkVisisted();
  const currentUser = await getCurrentUser();
  res.render("index.ejs", {
    countries: countries,
    total: countries.length,
    users: users,
    color: currentUser.color,
  });
});
app.post("/add", async (req, res) => {
  const input = req.body["country"];
  const currentUser = await getCurrentUser();

  try {
    const result = await db.query(
      "SELECT country_code FROM countries WHERE LOWER(country_name) LIKE '%' || $1 || '%';",
      [input.toLowerCase()]
    );

    const data = result.rows[0];
    const countryCode = data.country_code;
    try {
      await db.query(
        "INSERT INTO visited_countries (country_code, user_id) VALUES ($1, $2)",
        [countryCode, currentUserId]
      );
      res.redirect("/");
    } catch (err) {
      console.log(err);
    }
  } catch (err) {
    console.log(err);
  }
});

app.post("/user", async (req, res) => {
  if (req.body.add === "new") {
    res.render("new.ejs");
  } else {
    currentUserId = req.body.user;
    res.redirect("/");
  }
});

app.post("/new", async (req, res) => {
  const name = req.body.name;
  const color = req.body.color;

  const result = await db.query(
    "INSERT INTO users (name, color) VALUES($1, $2) RETURNING *;",
    [name, color]
  );

  const id = result.rows[0].id;
  currentUserId = id;

  res.redirect("/");
});

// Toggle the visited state of a country
app.post("/toggle", async (req, res) => {
  const countryCode = req.body.countryCode;

  try {
    // Check if the country is already visited by the current user
    const checkResult = await db.query(
      `
      SELECT visited_countries.country_code 
      FROM visited_countries
      JOIN users ON visited_countries.user_id = users.id
      WHERE visited_countries.country_code = $1 AND users.id = $2
      `,
      [countryCode, currentUserId]
    );

    if (checkResult.rows.length > 0) {
      // If it exists, delete it (toggle off)
      await db.query(
        `
        DELETE FROM visited_countries
        WHERE country_code = $1 AND user_id = $2
        `,
        [countryCode, currentUserId]
      );
      res.json({ success: true, visited: false });
    } else {
      // If it doesn't exist, insert it (toggle on)
      await db.query(
        `
        INSERT INTO visited_countries (country_code, user_id)
        VALUES ($1, $2)
        `,
        [countryCode, currentUserId]
      );
      res.json({ success: true, visited: true });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});



app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});