# Task Manager

A responsive to-do dashboard built with HTML, CSS, vanilla JavaScript, Flask REST APIs, and SQLite. The UI follows the supplied task-dashboard reference and includes task search, status and priority filters, overdue labels, and pagination.

## Run locally

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Open <http://127.0.0.1:5000>. SQLite database `tasks.db` is created automatically beside `app.py`.

## API routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/tasks` | List tasks; optional `status`, `priority`, and `q` query parameters |
| POST | `/api/tasks` | Create a task |
| GET | `/api/tasks/<id>` | Read one task |
| PUT | `/api/tasks/<id>` | Replace task fields |
| PATCH | `/api/tasks/<id>` | Partially update fields, including status |
| DELETE | `/api/tasks/<id>` | Delete a task |

Example create payload:

```json
{
  "title": "Prepare presentation",
  "description": "Finish the first draft",
  "deadline": "2026-10-20",
  "priority": "high",
  "status": "pending"
}
```

Task status values: `pending`, `completed`. Priority values: `low`, `medium`, `high`.

## API checks

Run the included API tests with:

```powershell
python -m unittest discover -s tests -v
```
