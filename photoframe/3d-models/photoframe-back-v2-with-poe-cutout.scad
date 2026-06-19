mm = 25.4; // millimeters per inch

width = 9 * mm;
height = 4.25 * mm;
thickness = 0.075 * mm;

monitor_top_xy = [0.25 * mm, height - 0.625 * mm];
monitor_dimensions = [2.35 * mm, 3.13 * mm];

screw_hole_diameter = 0.13 * mm;
reset_hole = [7.5 * mm, height - 3.5 * mm, 0.65 * mm];

holes = [
    [monitor_top_xy[0], monitor_top_xy[1], screw_hole_diameter],
    [monitor_top_xy[0] + monitor_dimensions[0], monitor_top_xy[1], screw_hole_diameter],
    [monitor_top_xy[0], monitor_top_xy[1] - monitor_dimensions[1], screw_hole_diameter],
    [monitor_top_xy[0] + monitor_dimensions[0], monitor_top_xy[1] - monitor_dimensions[1], screw_hole_diameter],

    [8.5 * mm, monitor_top_xy[1], screw_hole_diameter],
    [8.5 * mm, monitor_top_xy[1] - 3.125 * mm, screw_hole_diameter],

    [reset_hole[0], reset_hole[1], reset_hole[2]],
];


usb_hole_dimensions = [2.25 * mm, 2.2 * mm];
usb_hole = [width - usb_hole_dimensions[0], height - 3 * mm];

cpu_hole_dimensions = [2.6 * mm, 2.2 * mm];
cpu_hole = [3.3 * mm, height - 3 * mm];

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