import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.gitea_client import GiteaClient, GiteaServiceError  # noqa: E402
from services.gitea_service import (  # noqa: E402
    GiteaClient as LegacyGiteaClient,
    GiteaServiceError as LegacyGiteaServiceError,
)


class GiteaClientContractTestCase(unittest.TestCase):
    def test_service_module_reexports_client_and_error(self):
        self.assertIs(LegacyGiteaClient, GiteaClient)
        self.assertIs(LegacyGiteaServiceError, GiteaServiceError)

    def test_constructor_validates_repo_config(self):
        with self.assertRaisesRegex(GiteaServiceError, "资源库配置不完整"):
            GiteaClient("", "owner/repo", "main", "")

        with self.assertRaisesRegex(GiteaServiceError, "资源库格式应为 owner/repo"):
            GiteaClient("http://example.com", "owner-only", "main", "")

    def test_with_branch_returns_same_client_contract(self):
        client = GiteaClient("http://example.com/", "owner/repo", "main", "token")

        branch_client = client.with_branch("feature/refactor")

        self.assertIsInstance(branch_client, GiteaClient)
        self.assertEqual(branch_client.base_url, "http://example.com")
        self.assertEqual(branch_client.repo, "owner/repo")
        self.assertEqual(branch_client.branch, "feature/refactor")
        self.assertEqual(branch_client.token, "token")
        self.assertEqual(client.branch, "main")
        self.assertEqual(
            branch_client.raw_base_url,
            "http://example.com/owner/repo/raw/feature/refactor",
        )


if __name__ == "__main__":
    unittest.main()
