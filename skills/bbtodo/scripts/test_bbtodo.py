from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


def load_module():
    module_path = Path(__file__).with_name("bbtodo.py")
    spec = importlib.util.spec_from_file_location("repo_bbtodo_script", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {module_path}.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


bbtodo = load_module()


class FakeClient:
    last_instance: "FakeClient | None" = None

    def __init__(self, base_url: str, api_token: str):
        self.base_url = base_url
        self.api_token = api_token
        self.updated_payloads: list[tuple[str, str, dict[str, object]]] = []
        FakeClient.last_instance = self

    def list_projects(self):
        return [
            {
                "id": "project-1",
                "name": "Repo Project"
            }
        ]

    def create_project(self, name: str):
        raise AssertionError(f"create_project should not be called during ticket attach: {name}")

    def list_lanes(self, project_id: str):
        self._assert_project(project_id)
        return [
            {"id": "lane-todo", "name": "Todo"},
            {"id": "lane-progress", "name": "In Progress"},
            {"id": "lane-review", "name": "In review"},
        ]

    def list_tasks(self, project_id: str):
        self._assert_project(project_id)
        return []

    def get_task_by_ticket_id(self, ticket_id: str):
        if ticket_id == "MISS-404":
            raise bbtodo.BBTodoError("BBTodo API 404: Task not found.")
        if ticket_id != "BBTO-45":
            raise AssertionError(f"Unexpected ticket lookup: {ticket_id}")
        return {
            "body": "Existing issue description",
            "id": "task-1",
            "laneId": "lane-progress",
            "projectId": "project-1",
            "ticketId": ticket_id,
            "title": "Fetched task title",
        }

    def create_task(self, project_id: str, payload: dict[str, object]):
        raise AssertionError(f"create_task should not be called during ticket attach: {project_id} {payload}")

    def update_task(self, project_id: str, task_id: str, payload: dict[str, object]):
        self._assert_project(project_id)
        self.updated_payloads.append((project_id, task_id, payload))
        return {
            "body": payload["body"],
            "id": task_id,
            "laneId": payload["laneId"],
            "projectId": project_id,
            "ticketId": "BBTO-45",
            "title": "Fetched task title",
        }

    @staticmethod
    def _assert_project(project_id: str):
        if project_id != "project-1":
            raise AssertionError(f"Unexpected project id: {project_id}")


class RepoSkillTicketStartTests(unittest.TestCase):
    def make_config(self, temp_dir: str):
        return bbtodo.ScriptConfig(
            active_lane="In Progress",
            api_token="token",
            api_token_source="test",
            base_url="https://kb.example.test",
            env_file=Path(temp_dir) / ".env",
            project_name="Repo Project",
            review_lane="In review",
            start_lane="Todo",
            state_file=Path(temp_dir) / "state.json",
            worktree="D:/Code/bbtodo",
        )

    def test_start_with_ticket_id_attaches_existing_task(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = self.make_config(temp_dir)
            args = SimpleNamespace(
                active_lane=None,
                api_token=None,
                base_url=None,
                body="Extra planning note",
                body_file=None,
                project_name=None,
                review_lane=None,
                start_lane=None,
                state_key=None,
                ticket_id="BBTO-45",
                title=None,
                worktree=None,
            )
            stdout = io.StringIO()
            saved_state: dict[str, object] = {}

            with (
                patch.object(bbtodo, "build_config", return_value=config),
                patch.object(bbtodo, "BBTodoClient", FakeClient),
                patch.object(bbtodo, "load_state", return_value=None),
                patch.object(bbtodo, "save_state", side_effect=lambda _path, payload: saved_state.update(payload)),
                contextlib.redirect_stdout(stdout),
            ):
                bbtodo.command_start(args)

            response = json.loads(stdout.getvalue())
            client = FakeClient.last_instance
            self.assertIsNotNone(client)
            self.assertEqual(response["action"], "attached")
            self.assertEqual(response["taskTitle"], "Fetched task title")
            self.assertEqual(response["projectId"], "project-1")
            self.assertEqual(saved_state["project"]["id"], "project-1")
            self.assertEqual(saved_state["task"]["ticketId"], "BBTO-45")
            self.assertEqual(client.updated_payloads[0][1], "task-1")
            self.assertEqual(client.updated_payloads[0][2]["laneId"], "lane-todo")
            body = str(client.updated_payloads[0][2]["body"])
            self.assertIn("Existing issue description", body)
            self.assertIn("Extra planning note", body)
            self.assertIn("## Tracking", body)

    def test_start_with_ticket_id_does_not_fallback_to_create(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = self.make_config(temp_dir)
            args = SimpleNamespace(
                active_lane=None,
                api_token=None,
                base_url=None,
                body="",
                body_file=None,
                project_name=None,
                review_lane=None,
                start_lane=None,
                state_key=None,
                ticket_id="MISS-404",
                title=None,
                worktree=None,
            )

            with (
                patch.object(bbtodo, "build_config", return_value=config),
                patch.object(bbtodo, "BBTodoClient", FakeClient),
            ):
                with self.assertRaisesRegex(bbtodo.BBTodoError, "404"):
                    bbtodo.command_start(args)

    def test_start_parser_requires_exactly_one_of_title_or_ticket_id(self):
        parser = bbtodo.build_parser()

        with self.assertRaises(SystemExit):
            parser.parse_args(["start"])

        with self.assertRaises(SystemExit):
            parser.parse_args(["start", "--title", "Plan work", "--ticket-id", "BBTO-45"])


if __name__ == "__main__":
    unittest.main()
