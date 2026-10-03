"""Project metadata shares the task database and never moves scientific files."""

from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .examples.library import ExampleLibrary
from .store import Store, now


class ProjectInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)


class Project(ProjectInput):
    id: str
    created_at: str


def register_projects(app: FastAPI, store: Store, mutation):
    with store.connect() as db:
        db.execute("""CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
            created_at TEXT NOT NULL)""")

    library = ExampleLibrary(store)

    @app.get("/api/projects", response_model=list[Project])
    def list_projects():
        library.synchronize()
        with store.connect() as db:
            return [
                dict(row)
                for row in db.execute(
                    "SELECT p.* FROM projects p WHERE NOT EXISTS "
                    "(SELECT 1 FROM example_library_projects e WHERE e.project_id=p.id) "
                    "OR EXISTS (SELECT 1 FROM jobs j WHERE "
                    "json_extract(j.request, '$.project_id')=p.id AND NOT EXISTS "
                    "(SELECT 1 FROM example_library_tasks e WHERE e.job_id=j.id)) "
                    "ORDER BY p.created_at DESC"
                )
            ]

    @app.post(
        "/api/projects", response_model=Project, status_code=201, dependencies=[Depends(mutation)]
    )
    def create_project(value: ProjectInput):
        project = Project(id=str(uuid4()), created_at=now(), **value.model_dump())
        with store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT count(*) FROM projects").fetchone()[0] >= 100:
                raise HTTPException(429, "Project limit reached (100).")
            db.execute(
                "INSERT INTO projects(id,name,description,created_at) VALUES(?,?,?,?)",
                (project.id, project.name, project.description, project.created_at),
            )
        return project

    @app.patch(
        "/api/projects/{project_id}", response_model=Project, dependencies=[Depends(mutation)]
    )
    def rename_project(project_id: UUID, value: ProjectInput):
        with store.connect() as db:
            cursor = db.execute(
                "UPDATE projects SET name=?,description=? WHERE id=?",
                (value.name, value.description, str(project_id)),
            )
            if cursor.rowcount == 0:
                raise HTTPException(404, "Project not found.")
            return dict(
                db.execute("SELECT * FROM projects WHERE id=?", (str(project_id),)).fetchone()
            )
