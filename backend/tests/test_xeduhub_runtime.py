import sys
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from runtime.xeduhub_runtime import (  # noqa: E402
    xedu_clear_result,
    xedu_show_result_card,
    xedu_show_result_image,
)


class XEduHubRuntimeResultTestCase(unittest.TestCase):
    def test_result_card_emits_structured_event_outside_notebook(self):
        with patch('runtime.xeduhub_runtime._display_result_card', return_value=False), patch(
            'runtime.xeduhub_runtime.xedu_emit_runtime_event'
        ) as emit:
            payload = xedu_show_result_card({'检测框数': 2}, title='检测结果')

        self.assertEqual(payload, {'kind': 'result_card', 'title': '检测结果', 'result': {'检测框数': 2}})
        emit.assert_called_once_with(
            'result_card', title='检测结果', result={'检测框数': 2}
        )

    def test_result_image_event_contains_displayable_data_url(self):
        image = 'data:image/png;base64,aGVsbG8='
        with patch('runtime.xeduhub_runtime._display_result_image', return_value=False), patch(
            'runtime.xeduhub_runtime.xedu_emit_runtime_event'
        ) as emit:
            payload = xedu_show_result_image(image, title='标注图')

        self.assertEqual(payload['kind'], 'result_image')
        self.assertEqual(payload['image'], image)
        emit.assert_called_once_with('result_image', title='标注图', image=image)

    def test_clear_result_emits_a_clear_event(self):
        with patch('runtime.xeduhub_runtime.xedu_emit_runtime_event') as emit:
            payload = xedu_clear_result()

        self.assertEqual(payload, {'kind': 'clear_result'})
        emit.assert_called_once_with('clear_result')


if __name__ == '__main__':
    unittest.main()
