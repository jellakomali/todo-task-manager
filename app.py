from datetime import date
from contextlib import contextmanager
from pathlib import Path
import os
import sqlite3

from flask import Flask, jsonify, render_template, request


BASE_DIR = Path(__file__).resolve().parent
app = Flask(__name__)
app.config["DATABASE"] = os.environ.get(
    "TASK_DB_PATH", str(BASE_DIR / "tasks.db")
)


@contextmanager
def get_db():
    """Open a SQLite connection and always close it after use."""
    connection = sqlite3.connect(app.config["DATABASE"])
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_db():
    """Create the tasks table the first time the app runs."""
    database_path = Path(app.config["DATABASE"])
    database_path.parent.mkdir(parents=True, exist_ok=True)
    with get_db() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                deadline TEXT NOT NULL DEFAULT '',
                priority TEXT NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('low', 'medium', 'high')),
                status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'completed')),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )


def task_to_dict(row):
    return dict(row) if row else None


def error(message, status_code):
    return jsonify({"error": message}), status_code


def validate_task_data(data, existing=None, partial=False):
    """Validate and normalize API input. Return (values, error_message)."""
    if not isinstance(data, dict):
        return None, "Request body must be a JSON object."

    current = existing or {
        "title": "",
        "description": "",
        "deadline": "",
        "priority": "medium",
        "status": "pending",
    }
    values = dict(current)

    allowed = {"title", "description", "deadline", "priority", "status"}
    unknown = set(data) - allowed
    if unknown:
        return None, f"Unknown field(s): {', '.join(sorted(unknown))}."

    for key, value in data.items():
        if key in {"title", "description", "deadline", "priority", "status"}:
            values[key] = value

    if not partial or "title" in data:
        if not isinstance(values["title"], str) or not values["title"].strip():
            return None, "Title is required."
    values["title"] = values["title"].strip()

    for key in ("description", "deadline"):
        if not isinstance(values[key], str):
            return None, f"{key.capitalize()} must be text."
        values[key] = values[key].strip()

    if values["deadline"]:
        try:
            date.fromisoformat(values["deadline"])
        except ValueError:
            return None, "Deadline must be a valid date in YYYY-MM-DD format."

    values["priority"] = str(values["priority"]).lower()
    if values["priority"] not in {"low", "medium", "high"}:
        return None, "Priority must be low, medium, or high."

    values["status"] = str(values["status"]).lower()
    if values["status"] not in {"pending", "completed"}:
        return None, "Status must be pending or completed."

    return values, None


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/tasks")
def list_tasks():
    status = request.args.get("status", "all").lower()
    query = request.args.get("q", "").strip()
    priority = request.args.get("priority", "all").lower()

    if status not in {"all", "pending", "completed"}:
        return error("Status filter must be all, pending, or completed.", 400)
    if priority not in {"all", "low", "medium", "high"}:
        return error("Priority filter must be all, low, medium, or high.", 400)

    sql = "SELECT * FROM tasks WHERE 1 = 1"
    params = []
    if status != "all":
        sql += " AND status = ?"
        params.append(status)
    if priority != "all":
        sql += " AND priority = ?"
        params.append(priority)
    if query:
        sql += " AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ?)"
        pattern = f"%{query.lower()}%"
        params.extend([pattern, pattern])
    sql += " ORDER BY CASE WHEN deadline = '' THEN 1 ELSE 0 END, deadline, id DESC"

    with get_db() as connection:
        rows = connection.execute(sql, params).fetchall()
    return jsonify([task_to_dict(row) for row in rows])


@app.post("/api/tasks")
def create_task():
    data, message = validate_task_data(request.get_json(silent=True) or {})
    if message:
        return error(message, 400)

    with get_db() as connection:
        cursor = connection.execute(
            """INSERT INTO tasks (title, description, deadline, priority, status)
               VALUES (?, ?, ?, ?, ?)""",
            (data["title"], data["description"], data["deadline"],
             data["priority"], data["status"]),
        )
        row = connection.execute(
            "SELECT * FROM tasks WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
    return jsonify(task_to_dict(row)), 201


@app.get("/api/tasks/<int:task_id>")
def get_task(task_id):
    with get_db() as connection:
        row = connection.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()
    if not row:
        return error("Task not found.", 404)
    return jsonify(task_to_dict(row))


def update_task(task_id, partial):
    with get_db() as connection:
        row = connection.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()
        if not row:
            return error("Task not found.", 404)

        data, message = validate_task_data(
            request.get_json(silent=True) or {},
            existing=task_to_dict(row),
            partial=partial,
        )
        if message:
            return error(message, 400)

        connection.execute(
            """UPDATE tasks
               SET title = ?, description = ?, deadline = ?, priority = ?, status = ?
               WHERE id = ?""",
            (data["title"], data["description"], data["deadline"],
             data["priority"], data["status"], task_id),
        )
        updated = connection.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()
    return jsonify(task_to_dict(updated))


@app.put("/api/tasks/<int:task_id>")
def replace_task(task_id):
    return update_task(task_id, partial=False)


@app.patch("/api/tasks/<int:task_id>")
def patch_task(task_id):
    return update_task(task_id, partial=True)


@app.delete("/api/tasks/<int:task_id>")
def delete_task(task_id):
    with get_db() as connection:
        cursor = connection.execute(
            "DELETE FROM tasks WHERE id = ?", (task_id,)
        )
    if cursor.rowcount == 0:
        return error("Task not found.", 404)
    return jsonify({"message": "Task deleted."})


init_db()


if __name__ == "__main__":
    app.run(debug=True)
