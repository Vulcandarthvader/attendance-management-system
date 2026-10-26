# Attendance Tracker — how many classes can I skip?

A MERN app (MongoDB, Express, React, Node.js) for students who must keep a minimum attendance (like 75%).

You add your subjects, mark each class as **present** or **absent**, and for every subject the app tells you:

- **k**: how many more classes you can **skip** and still finish the semester at 75%, or
- **m**: if you are below 75%, how many classes you must **attend in a row** to get back.

Login uses **JWT** tokens, and passwords are hashed with **bcrypt**.

---

## Run it on your computer

You need **Node.js 18+** and **MongoDB**. MongoDB can be installed on your computer, or you can use a free MongoDB Atlas cluster.

**1. Start the backend**

```bash
cd server
npm install
cp .env.example .env      # on Windows: copy .env.example .env
# open .env and set MONGO_URI and JWT_SECRET
npm run dev
```

You should see `Connected to MongoDB` and `Server running on http://localhost:5000`.

**2. Start the frontend** (in a second terminal)

```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173. Create an account, add a subject, and start marking.

---

## Folder structure

```
server/                      ← Backend (Node + Express + MongoDB)
  index.js                   Starts Express, connects to MongoDB, mounts the routes
  .env.example               Settings template (MONGO_URI, JWT_SECRET, PORT)
  models/
    User.js                  name, email, password (bcrypt hash)
    Course.js                user, name, totalClasses, minAttendance
    Attendance.js            user, course, date, status (present/absent)
  middleware/
    auth.js                  Checks the JWT token; blocks requests without one
  routes/
    auth.js                  register, login, me
    courses.js               add / list / view / edit / delete subjects
    attendance.js            mark a class, delete a record
  utils/
    calculate.js             THE FORMULAS: percentage, k, m, status

client/                      ← Frontend (React + Vite)
  vite.config.js             Forwards /api requests to the backend on port 5000
  src/
    main.jsx                 Starts React
    App.jsx                  Shows Login if logged out; otherwise the pages
    api.js                   One helper for all backend calls (adds the token)
    pages/Login.jsx          Login + Register form
    pages/Dashboard.jsx      All subjects + "Add a subject" form
    pages/CourseDetail.jsx   One subject: stats, mark any date, settings, history
    components/CourseCard.jsx  A subject's card on the dashboard
    styles.css               Styling
```

---

## How the data flows (example: tapping "Present today")

```
React (CourseCard button)
  → api.js sends  POST /api/attendance  { courseId, date, status }
                  with header  Authorization: Bearer <token>
  → Vite proxy forwards it to Express on port 5000
  → middleware/auth.js checks the token and sets req.userId
  → routes/attendance.js checks the input, checks the course belongs to you,
    then creates the record (or updates it if that date is already marked)
  → MongoDB saves it
  → React reloads GET /api/courses
  → routes/courses.js counts present/absent → utils/calculate.js → k, m, message
  → The card shows the new numbers
```

**Login flow:** register or login → the server checks the password with bcrypt → it sends back a JWT → React saves it in `localStorage` → every later request sends it in the `Authorization` header.

---

## The maths (utils/calculate.js)

| Symbol | Meaning |
|---|---|
| a | classes attended (present) |
| h | classes held so far (present + absent) |
| T | total classes in the semester (you enter this) |
| r | remaining classes = T − h |
| p | minimum attendance, e.g. 0.75 |

**How many can I skip?** Your final % must stay at or above p:

```
(a + r − k) / T ≥ p   →   k ≤ a + r − p·T
```

**How many must I attend in a row to recover?** Each class you attend adds 1 to the top and the bottom of the fraction:

```
(a + m) / (h + m) ≥ p   →   m ≥ (p·h − a) / (1 − p)
```

**Example:** T = 60, h = 40, a = 30, so r = 20 and you are at 75%.
k = 30 + 20 − 45 = **5**. You can skip 5 more classes.

**Example:** a = 25, h = 40 (62.5%).
m = (30 − 25) / 0.25 = **20**. Attend 20 in a row. Check: 45 / 60 = 75%.

The code uses whole percentages (75, not 0.75) and multiplies by 100. That way every number is an integer and there are no decimal rounding mistakes.

**Status** (the coloured badge):

| Status | When |
|---|---|
| safe | at or above the minimum, and you can still skip at least 1 class |
| tight | at or above the minimum now, but you cannot skip any more classes |
| recovering | below the minimum now, but attending enough classes gets you back |
| unrecoverable | even attending every remaining class cannot reach the minimum |

Note: **k** is about your *final* percentage at the end of the semester. **m** is about getting back above the line *now*. While you are recovering, both can be shown.

---

## API endpoints (10)

Every route except register and login needs `Authorization: Bearer <token>`.

| Method | URL | What it does |
|---|---|---|
| POST | /api/auth/register | Create account (password hashed with bcrypt) → token |
| POST | /api/auth/login | Check password → token |
| GET | /api/auth/me | Who is logged in (used on page reload) |
| GET | /api/courses | My subjects, each with its stats |
| POST | /api/courses | Add a subject |
| GET | /api/courses/:id | One subject + stats + all its records |
| PUT | /api/courses/:id | Change name, total classes or minimum % |
| DELETE | /api/courses/:id | Delete a subject and its records |
| POST | /api/attendance | Mark present/absent for a date (marking again updates it) |
| DELETE | /api/attendance/:id | Delete one record |

---

## Rules the server enforces

- You can only see and change **your own** data. Every query filters by your user id.
- You cannot mark a **future** date.
- There is only **one record per subject per day**. A unique index on `(course, date)` guarantees it, and marking the same day again updates the record.
- You cannot record more classes than the subject's **total**.
- Passwords are never stored or sent back. Only the bcrypt hash is stored.

## Tech stack

| Part | Used | Why |
|---|---|---|
| Frontend | React + Vite + React Router | Components and state; Vite gives a fast dev server and the /api proxy |
| Backend | Node.js + Express | Simple, popular way to build a REST API in JavaScript |
| Database | MongoDB + Mongoose | Stores JSON-like documents; Mongoose adds schemas and validation |
| Auth | JWT + bcryptjs | Stateless login tokens; secure password hashing |

## Ideas to add later

- A semester timetable, so total classes are counted automatically from dates and weekdays
- A "cancelled" status for classes the teacher cancels
- A chart of attendance over time
- Reminders to mark today's classes
- Deployment (Render or Railway for the backend, Vercel for the frontend, Atlas for the database)
