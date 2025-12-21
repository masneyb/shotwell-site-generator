#!/usr/bin/env python3
# Copyright (C) 2020-2025 Brian Masney <masneyb@onstation.org>

import unittest
import re
from fractions import Fraction
from exiv2_metadata import Exiv2MetadataParser

def _read_exif_txt(file_contents):
    """Copy of the parsing function from media_thumbnailer.py"""
    ret = {}
    for line in file_contents:
        parts = re.split(r'\s+', line.strip(), maxsplit=3)
        if len(parts) == 3:
            ret[parts[0]] = ''
        elif len(parts) >= 4:
            ret[parts[0]] = parts[3]
    return ret

def parse_rational(value_str):
    """Copy of the parsing function from exiv2_metadata.py"""
    if not value_str:
        return None

    value_str = value_str.strip()

    if '/' in value_str:
        try:
            parts = value_str.split('/')
            return Fraction(int(parts[0]), int(parts[1]))
        except (ValueError, ZeroDivisionError):
            return None
    else:
        try:
            return float(value_str)
        except ValueError:
            return None

class TestExiv2Metadata(unittest.TestCase):
    def setUp(self):
        self.parser = Exiv2MetadataParser({})

    def test_precise_rational_values(self):
        """Test that precise rational values are preserved (not rounded)"""
        sample_metadata = {
            'Exif.Photo.FNumber': '168/100',
            'Exif.Photo.ExposureTime': '1/125',
            'Exif.Photo.FocalLength': '202/100',
            'Exif.Photo.ISOSpeedRatings': '800',
            'Exif.Image.Make': 'Google',
            'Exif.Image.Model': 'Pixel 9 Pro'
        }

        result = self.parser.parse_photo_metadata(sample_metadata)

        self.assertEqual(result['exif'], ['f/1.68', '1/125s', '2.02mm', 'ISO800'])
        self.assertEqual(result['camera'], 'Google Pixel 9 Pro')

    def test_trailing_zero_removal(self):
        """Test that trailing zeros are removed from rounded values"""
        sample_metadata = {
            'Exif.Photo.FNumber': '17/10',
            'Exif.Photo.ExposureTime': '1/125',
            'Exif.Photo.FocalLength': '2/1',
            'Exif.Photo.ISOSpeedRatings': '800',
        }

        result = self.parser.parse_photo_metadata(sample_metadata)

        self.assertEqual(result['exif'], ['f/1.7', '1/125s', '2mm', 'ISO800'])

    def test_edge_cases(self):
        """Test various edge cases for aperture and focal length"""
        sample_metadata = {
            'Exif.Photo.FNumber': '28/10',
            'Exif.Photo.FocalLength': '50/10',
        }

        result = self.parser.parse_photo_metadata(sample_metadata)

        self.assertEqual(result['exif'], ['f/2.8', '5mm'])

    def test_gps_rational_format(self):
        """Test GPS parsing with rational format (from -PEXvkyc)"""
        sample_metadata = {
            'Exif.GPSInfo.GPSLatitude': '41/1 29/1 2424/100',
            'Exif.GPSInfo.GPSLatitudeRef': 'North',
            'Exif.GPSInfo.GPSLongitude': '81/1 41/1 534/100',
            'Exif.GPSInfo.GPSLongitudeRef': 'West',
            'Exif.Photo.FNumber': '168/100',
            'Exif.Photo.ExposureTime': '1/125',
            'Exif.Photo.FocalLength': '202/100',
            'Exif.Photo.ISOSpeedRatings': '800',
            'Exif.Image.Make': 'Google',
            'Exif.Image.Model': 'Pixel 9 Pro'
        }

        result = self.parser.parse_photo_metadata(sample_metadata)

        self.assertAlmostEqual(result['lat'], 41.490067, places=6)
        self.assertAlmostEqual(result['lon'], -81.684817, places=6)
        self.assertEqual(result['camera'], 'Google Pixel 9 Pro')
        self.assertEqual(result['exif'], ['f/1.68', '1/125s', '2.02mm', 'ISO800'])

    def test_gps_degree_format(self):
        """Test GPS parsing with degree/minute/second format"""
        sample_metadata = {
            'Exif.GPSInfo.GPSLatitude': "41deg 29' 24.24\"",
            'Exif.GPSInfo.GPSLatitudeRef': 'North',
            'Exif.GPSInfo.GPSLongitude': "81deg 41' 5.34\"",
            'Exif.GPSInfo.GPSLongitudeRef': 'West',
            'Exif.Photo.FNumber': '17/10',
            'Exif.Photo.ExposureTime': '1/125',
            'Exif.Photo.FocalLength': '2/1',
            'Exif.Photo.ISOSpeedRatings': '800',
        }

        result = self.parser.parse_photo_metadata(sample_metadata)

        self.assertAlmostEqual(result['lat'], 41.490067, places=6)
        self.assertAlmostEqual(result['lon'], -81.684817, places=6)
        self.assertEqual(result['exif'], ['f/1.7', '1/125s', '2mm', 'ISO800'])

    def test_gps_direction_south_west(self):
        """Test GPS parsing with South and West directions"""
        sample_metadata = {
            'Exif.GPSInfo.GPSLatitude': "41deg 29' 24.24\"",
            'Exif.GPSInfo.GPSLatitudeRef': 'South',
            'Exif.GPSInfo.GPSLongitude': "81deg 41' 5.34\"",
            'Exif.GPSInfo.GPSLongitudeRef': 'West',
        }

        result = self.parser.parse_photo_metadata(sample_metadata)

        self.assertLess(result['lat'], 0, "South latitude should be negative")
        self.assertLess(result['lon'], 0, "West longitude should be negative")
        self.assertAlmostEqual(result['lat'], -41.490067, places=6)

    def test_camera_make_model(self):
        """Test camera make and model parsing"""
        test_cases = [
            (('Canon', 'Canon EOS 5D Mark IV'), 'Canon EOS 5D Mark IV'),
            (('Apple', 'iPhone 12 Pro'), 'Apple iPhone 12 Pro'),
            (('Google', 'Pixel 9 Pro'), 'Google Pixel 9 Pro'),
            (('', 'Pixel 9 Pro'), 'Pixel 9 Pro'),
            (('Google', ''), 'Google'),
        ]

        for (make, model), expected in test_cases:
            with self.subTest(make=make, model=model):
                result = self.parser.parse_camera_make_model(make, model)
                self.assertEqual(result, expected)

    def test_complete_metadata(self):
        """Test complete metadata parsing with all fields"""
        sample_metadata = {
            'Exif.GPSInfo.GPSLatitude': '41/1 29/1 2424/100',
            'Exif.GPSInfo.GPSLatitudeRef': 'North',
            'Exif.GPSInfo.GPSLongitude': '81/1 41/1 534/100',
            'Exif.GPSInfo.GPSLongitudeRef': 'West',
            'Exif.Photo.FNumber': '168/100',
            'Exif.Photo.ExposureTime': '1/125',
            'Exif.Photo.FocalLength': '202/100',
            'Exif.Photo.ISOSpeedRatings': '800',
            'Exif.Image.Make': 'Google',
            'Exif.Image.Model': 'Pixel 9 Pro'
        }

        result = self.parser.parse_photo_metadata(sample_metadata)

        self.assertIn('lat', result)
        self.assertIn('lon', result)
        self.assertIn('camera', result)
        self.assertIn('exif', result)
        self.assertEqual(len(result['exif']), 4)

class TestExiv2TextParsing(unittest.TestCase):
    def test_basic_exif_parsing(self):
        """Test basic EXIF tag parsing"""
        sample_output = """Exif.Image.Make                              Ascii       6  Google
Exif.Image.Model                             Ascii      17  Pixel 9 Pro
Exif.Photo.FNumber                           Rational    1  168/100
Exif.Photo.ExposureTime                      Rational    1  1/125"""

        result = _read_exif_txt(sample_output.split('\n'))

        self.assertEqual(result['Exif.Image.Make'], 'Google')
        self.assertEqual(result['Exif.Image.Model'], 'Pixel 9 Pro')
        self.assertEqual(result['Exif.Photo.FNumber'], '168/100')
        self.assertEqual(result['Exif.Photo.ExposureTime'], '1/125')

    def test_gps_parsing(self):
        """Test GPS coordinate parsing from exiv2 output"""
        sample_output = """Exif.GPSInfo.GPSLatitude                     Rational    3  41/1 29/1 2424/100
Exif.GPSInfo.GPSLatitudeRef                  Ascii       2  North
Exif.GPSInfo.GPSLongitude                    Rational    3  81/1 41/1 534/100
Exif.GPSInfo.GPSLongitudeRef                 Ascii       2  West"""

        result = _read_exif_txt(sample_output.split('\n'))

        self.assertEqual(result['Exif.GPSInfo.GPSLatitude'], '41/1 29/1 2424/100')
        self.assertEqual(result['Exif.GPSInfo.GPSLatitudeRef'], 'North')
        self.assertEqual(result['Exif.GPSInfo.GPSLongitude'], '81/1 41/1 534/100')
        self.assertEqual(result['Exif.GPSInfo.GPSLongitudeRef'], 'West')

    def test_xmp_motion_photo_parsing(self):
        """Test XMP Container.Directory parsing for motion photos"""
        sample_output = """Xmp.GCamera.MicroVideo                       XmpText     1  1
Xmp.GCamera.MicroVideoOffset                 XmpText     6  123456
Xmp.Container.Directory[1]/Container:Item/Item:Semantic  XmpText    11  MotionPhoto
Xmp.Container.Directory[1]/Container:Item/Item:Length    XmpText     6  789012
Xmp.Container.Directory[2]/Container:Item/Item:Semantic  XmpText     5  Image
Xmp.Container.Directory[3]/Container:Item/Item:Semantic  XmpText    11  MotionPhoto
Xmp.Container.Directory[3]/Container:Item/Item:Length    XmpText     6  345678
Xmp.Container_1_.Directory[2]/Container_1_:Item/Item_1_:Semantic  XmpText  11  MotionPhoto
Xmp.Container_1_.Directory[2]/Container_1_:Item/Item_1_:Length     XmpText   6  456789"""

        result = _read_exif_txt(sample_output.split('\n'))

        self.assertEqual(result.get('Xmp.GCamera.MicroVideo'), '1')
        self.assertEqual(result.get('Xmp.GCamera.MicroVideoOffset'), '123456')
        self.assertEqual(result.get('Xmp.Container.Directory[3]/Container:Item/Item:Length'), '345678')
        self.assertEqual(result.get('Xmp.Container_1_.Directory[2]/Container_1_:Item/Item_1_:Length'), '456789')

    def test_values_with_spaces(self):
        """Test that values with spaces are preserved"""
        sample_output = """Exif.Image.Make                              Ascii       6  Google
Exif.Image.Model                             Ascii      20  Pixel 9 Pro XL Test
Exif.Image.Software                          Ascii      15  HDR+ 1.0.5
Exif.Photo.UserComment                       Ascii      30  This is a long comment text"""

        result = _read_exif_txt(sample_output.split('\n'))

        self.assertEqual(result['Exif.Image.Model'], 'Pixel 9 Pro XL Test')
        self.assertEqual(result['Exif.Image.Software'], 'HDR+ 1.0.5')
        self.assertEqual(result['Exif.Photo.UserComment'], 'This is a long comment text')

    def test_empty_values(self):
        """Test parsing of empty values"""
        sample_output = """Exif.Photo.SubSecTime                       Ascii       0
Exif.Photo.SubSecTimeOriginal               Ascii       0  """

        result = _read_exif_txt(sample_output.split('\n'))

        self.assertEqual(result['Exif.Photo.SubSecTime'], '')
        self.assertEqual(result['Exif.Photo.SubSecTimeOriginal'], '')

    def test_all_precision_values(self):
        """Test that raw rational values are preserved in parsing"""
        sample_output = """Exif.Photo.FNumber                           Rational    1  168/100
Exif.Photo.FocalLength                       Rational    1  202/100
Exif.Photo.ExposureTime                      Rational    1  1/125
Exif.Photo.ISOSpeedRatings                   Short       1  800"""

        result = _read_exif_txt(sample_output.split('\n'))

        self.assertEqual(result['Exif.Photo.FNumber'], '168/100')
        self.assertEqual(result['Exif.Photo.FocalLength'], '202/100')
        self.assertEqual(result['Exif.Photo.ExposureTime'], '1/125')
        self.assertEqual(result['Exif.Photo.ISOSpeedRatings'], '800')

class TestRationalParsing(unittest.TestCase):
    def test_fraction_parsing(self):
        """Test parsing of rational fractions"""
        test_cases = [
            ('168/100', Fraction(168, 100)),
            ('17/10', Fraction(17, 10)),
            ('1/125', Fraction(1, 125)),
            ('202/100', Fraction(202, 100)),
            ('2/1', Fraction(2, 1)),
            ('28/10', Fraction(28, 10)),
            ('50/10', Fraction(50, 10)),
        ]

        for input_val, expected in test_cases:
            with self.subTest(input=input_val):
                result = parse_rational(input_val)
                self.assertEqual(result, expected)

    def test_decimal_parsing(self):
        """Test parsing of decimal values"""
        test_cases = [
            ('1.7', 1.7),
            ('2.8', 2.8),
            ('50', 50.0),
            ('800', 800.0),
            ('1.68', 1.68),
            ('2.02', 2.02),
        ]

        for input_val, expected in test_cases:
            with self.subTest(input=input_val):
                result = parse_rational(input_val)
                self.assertEqual(result, expected)

    def test_precision_preservation(self):
        """Test that precision is preserved when converting to float"""
        test_cases = [
            ('168/100', 1.68),
            ('202/100', 2.02),
            ('17/10', 1.7),
            ('28/10', 2.8),
        ]

        for input_val, expected_float in test_cases:
            with self.subTest(input=input_val):
                result = parse_rational(input_val)
                result_float = float(result)
                self.assertAlmostEqual(result_float, expected_float, places=4)

    def test_formatting_with_trailing_zeros(self):
        """Test formatting values with proper trailing zero handling"""
        test_cases = [
            (Fraction(168, 100), '1.68'),
            (Fraction(17, 10), '1.7'),
            (Fraction(202, 100), '2.02'),
            (Fraction(2, 1), '2'),
            (Fraction(28, 10), '2.8'),
            (Fraction(50, 10), '5'),
        ]

        for input_val, expected in test_cases:
            with self.subTest(input=input_val):
                formatted = ("%.2f" % float(input_val)).rstrip('0').rstrip('.')
                self.assertEqual(formatted, expected)

    def test_invalid_values(self):
        """Test parsing of invalid values"""
        invalid_cases = [
            '',
            None,
            '/',
            '1/',
            '/1',
            'abc',
            '1/0',
            'not a number',
        ]

        for input_val in invalid_cases:
            with self.subTest(input=input_val):
                result = parse_rational(input_val)
                self.assertIsNone(result)

    def test_gps_rational_components(self):
        """Test parsing GPS coordinate components"""
        gps_lat_parts = '41/1 29/1 2424/100'.split()

        deg = parse_rational(gps_lat_parts[0])
        minutes = parse_rational(gps_lat_parts[1])
        seconds = parse_rational(gps_lat_parts[2])

        self.assertEqual(float(deg), 41.0)
        self.assertEqual(float(minutes), 29.0)
        self.assertAlmostEqual(float(seconds), 24.24, places=2)

        decimal = float(deg) + (float(minutes) / 60.0) + (float(seconds) / 3600.0)
        self.assertAlmostEqual(decimal, 41.490067, places=6)

    def test_aperture_values(self):
        """Test common aperture values"""
        test_cases = [
            ('168/100', 'f/1.68'),
            ('17/10', 'f/1.7'),
            ('28/10', 'f/2.8'),
            ('4/1', 'f/4'),
            ('56/10', 'f/5.6'),
            ('8/1', 'f/8'),
        ]

        for input_val, expected in test_cases:
            with self.subTest(input=input_val):
                result = parse_rational(input_val)
                aperture_str = ("%.2f" % float(result)).rstrip('0').rstrip('.')
                formatted = f"f/{aperture_str}"
                self.assertEqual(formatted, expected)

    def test_focal_length_values(self):
        """Test common focal length values"""
        test_cases = [
            ('202/100', '2.02mm'),
            ('2/1', '2mm'),
            ('24/1', '24mm'),
            ('35/1', '35mm'),
            ('50/1', '50mm'),
            ('85/1', '85mm'),
        ]

        for input_val, expected in test_cases:
            with self.subTest(input=input_val):
                result = parse_rational(input_val)
                focal_str = ("%.2f" % float(result)).rstrip('0').rstrip('.')
                formatted = f"{focal_str}mm"
                self.assertEqual(formatted, expected)

if __name__ == '__main__':
    unittest.main()
