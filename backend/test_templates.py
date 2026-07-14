import unittest

from templates import TEMPLATES, resolution_dims


class ResolutionDimensionsTests(unittest.TestCase):
    def test_all_render_dimensions_are_even(self) -> None:
        for template in TEMPLATES.values():
            for resolution in ("480p", "720p", "1080p"):
                with self.subTest(template=template.id, resolution=resolution):
                    width, height = resolution_dims(resolution, template)
                    self.assertEqual(width % 2, 0)
                    self.assertEqual(height % 2, 0)

    def test_vertical_480p_is_h264_compatible(self) -> None:
        self.assertEqual(resolution_dims("480p", TEMPLATES["reels_full"]), (480, 854))


if __name__ == "__main__":
    unittest.main()
