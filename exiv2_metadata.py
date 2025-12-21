#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2020-2025 Brian Masney <masneyb@onstation.org>

import re
from fractions import Fraction

class Exiv2MetadataParser:
    def __init__(self, camera_transformations):
        self.camera_transformations = camera_transformations

    def parse_photo_metadata(self, exif_metadata):
        ret = {}
        ret["exif"] = []

        lat = self.__parse_gps_coordinate(exif_metadata, "Exif.GPSInfo.GPSLatitude",
                                          "Exif.GPSInfo.GPSLatitudeRef")
        lon = self.__parse_gps_coordinate(exif_metadata, "Exif.GPSInfo.GPSLongitude",
                                          "Exif.GPSInfo.GPSLongitudeRef")
        if lat is not None and lon is not None and lat != 0.0 and lon != 0.0:
            ret["lat"] = lat
            ret["lon"] = lon

        aperture = self.__get_aperture(exif_metadata)
        if aperture:
            aperture_str = ("%.2f" % aperture).rstrip('0').rstrip('.')
            ret["exif"].append("f/%s" % (aperture_str))

        shutter = self.__get_shutter_speed(exif_metadata)
        if shutter:
            if shutter.denominator == 1:
                ret["exif"].append("%ds" % (shutter.numerator))
            else:
                ret["exif"].append("1/%ds" % (round(shutter.denominator / shutter.numerator)))

        focal_length = self.__get_focal_length(exif_metadata)
        if focal_length:
            focal_str = ("%.2f" % focal_length).rstrip('0').rstrip('.')
            ret["exif"].append("%smm" % (focal_str))

        iso = self.__get_iso(exif_metadata)
        if iso:
            ret["exif"].append("ISO%s" % (iso))

        if "Exif.Image.Make" in exif_metadata:
            camera_make = exif_metadata["Exif.Image.Make"].strip()
            camera_model = exif_metadata.get("Exif.Image.Model", "").strip()
            camera = self.parse_camera_make_model(camera_make, camera_model)
            if camera:
                ret["camera"] = camera

        return ret

    def parse_camera_make_model(self, make, model):
        if not make:
            camera = model
        elif not model:
            camera = make
        elif model.startswith(make):
            camera = model
        else:
            camera = "%s %s" % (make, model)

        if not camera:
            return None
        if camera in self.camera_transformations:
            return self.camera_transformations[camera]
        return camera

    def __parse_gps_coordinate(self, exif_metadata, lat_tag, lat_ref_tag):
        if lat_tag not in exif_metadata or lat_ref_tag not in exif_metadata:
            return None

        coord_str = exif_metadata[lat_tag]
        ref = exif_metadata[lat_ref_tag]

        if 'deg' in coord_str:
            parts = re.findall(r"([\d.]+)", coord_str)
            if len(parts) >= 3:
                degrees = float(parts[0])
                minutes = float(parts[1])
                seconds = float(parts[2])
                decimal = degrees + (minutes / 60.0) + (seconds / 3600.0)
            elif len(parts) == 1:
                decimal = float(parts[0])
            else:
                return None
        else:
            parts = coord_str.split()
            if len(parts) == 3:
                deg_rational = self.__parse_rational(parts[0])
                min_rational = self.__parse_rational(parts[1])
                sec_rational = self.__parse_rational(parts[2])
                if deg_rational is None or min_rational is None or sec_rational is None:
                    return None
                degrees = float(deg_rational)
                minutes = float(min_rational)
                seconds = float(sec_rational)
                decimal = degrees + (minutes / 60.0) + (seconds / 3600.0)
            else:
                try:
                    decimal = float(coord_str)
                except ValueError:
                    return None

        if ref[0] in ('S', 'W'):
            decimal *= -1

        return decimal

    def __parse_rational(self, value_str):
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

    def __get_aperture(self, exif_metadata):
        if 'Exif.Photo.FNumber' in exif_metadata:
            value = self.__parse_rational(exif_metadata['Exif.Photo.FNumber'])
            if value:
                return float(value) if isinstance(value, Fraction) else value

        if 'Exif.Photo.ApertureValue' in exif_metadata:
            value = self.__parse_rational(exif_metadata['Exif.Photo.ApertureValue'])
            if value:
                apex = float(value) if isinstance(value, Fraction) else value
                return 2.0 ** (apex / 2.0)

        return None

    def __get_shutter_speed(self, exif_metadata):
        if 'Exif.Photo.ExposureTime' in exif_metadata:
            value = self.__parse_rational(exif_metadata['Exif.Photo.ExposureTime'])
            if value:
                return value if isinstance(value, Fraction) else Fraction(value).limit_denominator()

        if 'Exif.Photo.ShutterSpeedValue' in exif_metadata:
            value = self.__parse_rational(exif_metadata['Exif.Photo.ShutterSpeedValue'])
            if value:
                apex = float(value) if isinstance(value, Fraction) else value
                exposure = 2.0 ** (-apex)
                return Fraction(exposure).limit_denominator()

        return None

    def __get_focal_length(self, exif_metadata):
        if 'Exif.Photo.FocalLength' in exif_metadata:
            value = self.__parse_rational(exif_metadata['Exif.Photo.FocalLength'])
            if value:
                return float(value) if isinstance(value, Fraction) else value
        return None

    def __get_iso(self, exif_metadata):
        for tag in ['Exif.Photo.ISOSpeedRatings', 'Exif.Photo.PhotographicSensitivity',
                    'Exif.Image.ISOSpeedRatings']:
            if tag in exif_metadata and exif_metadata[tag]:
                try:
                    return int(exif_metadata[tag])
                except ValueError:
                    continue
        return None
