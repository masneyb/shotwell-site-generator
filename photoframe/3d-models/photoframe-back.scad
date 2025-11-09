mm = 25.4; // millimeters per inch

width = 9 * mm;
height = 4.25 * mm;
thickness = 0.075 * mm;

monitor_top_xy = [0.25 * mm, height - 0.625 * mm];
monitor_dimensions = [2.35 * mm, 3.13 * mm];

rpi_top_xy = [3.51 * mm, height - 0.9 * mm];
rpi_dimensions = [2.25 * mm, 1.91 * mm];

screw_hole_diameter = 0.13 * mm;
reset_hole = [7.5 * mm, height - 3.5 * mm, 0.65 * mm];

holes = [
    [monitor_top_xy[0], monitor_top_xy[1], screw_hole_diameter],
    [monitor_top_xy[0] + monitor_dimensions[0], monitor_top_xy[1], screw_hole_diameter],
    [monitor_top_xy[0], monitor_top_xy[1] - monitor_dimensions[1], screw_hole_diameter],
    [monitor_top_xy[0] + monitor_dimensions[0], monitor_top_xy[1] - monitor_dimensions[1], screw_hole_diameter],

    [rpi_top_xy[0], rpi_top_xy[1], screw_hole_diameter],
    [rpi_top_xy[0] + rpi_dimensions[0], rpi_top_xy[1], screw_hole_diameter],
    [rpi_top_xy[0], rpi_top_xy[1] - rpi_dimensions[1], screw_hole_diameter],


    [8.5 * mm, monitor_top_xy[1], screw_hole_diameter],
    [8.5 * mm, monitor_top_xy[1] - 3.125 * mm, screw_hole_diameter],

    [reset_hole[0], reset_hole[1], reset_hole[2]],
];


usb_hole_dimensions = [2.25 * mm, 1.75 * mm];
usb_hole = [width - usb_hole_dimensions[0], (height - usb_hole_dimensions[1]) / 2];

cpu_hole_dimensions = [1.75 * mm, 1.5 * mm];
cpu_hole = [3.625 * mm, height - 2.35 * mm];

difference() {
    cube([width, height, thickness], center = false);

    for (pos = holes) {
        translate([pos[0], pos[1], thickness / 2])
            cylinder(h = thickness + 1, d = pos[2], center = true);
    }

    translate([usb_hole[0], usb_hole[1], 0])
        cube([usb_hole_dimensions[0], usb_hole_dimensions[1], thickness + 1], center = false);

    translate([cpu_hole[0], cpu_hole[1], 0])
        cube([cpu_hole_dimensions[0], cpu_hole_dimensions[1], thickness + 1], center = false);
}

color("black") {
    labels = [
        [5.5 * mm, height - 0.2 * mm, "https://github.com/masneyb/shotwell-site-generator", "center"],
        [reset_hole[0], reset_hole[1] - 0.4 * mm, "RESET", "center"],
        [1.2 * mm, height - 3.6 * mm, "MONITOR", "center"],
        [0.75 * mm, height - 3.9 * mm, "12V", "center"],
        [1.5 * mm, height - 3.9 * mm, "HDMI", "center"],
        [4.1 * mm, height - 3.6 * mm, "RPI4", "center"],
        [3.75 * mm, height - 3.9 * mm, "5V", "center"],
        [4.4 * mm, height - 3.9 * mm, "HDMI", "center"],
        [usb_hole[0] - 0.1 * mm, height - 2 * mm, "PHOTOS", "right"],
        [usb_hole[0] - 0.1 * mm, height - 2.3 * mm, "USB", "right"],
    ];

    for (label = labels) {
        translate([label[0], label[1], thickness + 0.1])
            linear_extrude(height = 1)
                text(label[2], size = 5, halign = label[3], valign = "top");
    }
}
    
