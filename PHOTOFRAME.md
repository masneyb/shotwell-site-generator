# Photo Frame

My photo frame has the following hardware components:

- Raspberry Pi 4
- One of the following screens:
  - Official Raspberry Pi 7" Touchscreen Display along with a
    [case for 7" touchscreen](https://thepihut.com/products/raspberry-pi-official-7-touchscreen-case).
    If you go with this case, then you'll most likely want to get a
    [90-degree USB-C adapter](https://thepihut.com/products/usb-c-angle-adapter) if you're going
    to set this on a flat surface. The [SmartPi Touch](https://www.sparkfun.com/products/14059) is
    another case with a stand.
  - The
    [Sunfounder 10.1" 1280x800 HDMI Touchscreen](https://www.sunfounder.com/products/10inch-touchscreen-for-raspberrypi)
    is a higher-quality screen, however be aware that the backlight doesn't turn off on the
    screen when the monitor turns off.
- Optional: [Momentary push button](https://www.adafruit.com/product/1445) that's wired
  up to a GPIO pin to toggle the power for the screen.
- Power supply for pi.

The screen is automatically powered off at night and comes back on in the morning.

## Base OS Install

I used the 2024-03-15 64-bit release of Raspberry Pi OS from
https://downloads.raspberrypi.org/raspios_arm64/images/.

    sudo apt install -y libnss3-tools python3-lgpio unattended-upgrades

If you are using the official Raspberry Pi 7" touchscreen, then
add the following to /boot/config.txt:

    dtoverlay=rpi-ft5406

Additional parameters to add to /boot/config.txt:

    # Disable Activity LED
    dtparam=act_led_trigger=none
    dtparam=act_led_activelow=off

    # Disable Power LED"
    dtparam=pwr_led_trigger=none
    dtparam=pwr_led_activelow=off

## Scripts to start/stop Chromium browser

Script to start the Chromium browser in kiosk mode with the proper URL with the file
/usr/local/bin/start-photos.sh:

    #!/usr/bin/env bash
    set -e
    killall chromium-browser || true
    export DISPLAY=:0
    export XAUTHORITY=/home/pi/.Xauthority
    xset -dpms s off s noblank s 0 0 s noexpose
    if [ -d /sys/class/backlight/rpi_backlight ] ; then
    	echo 0 > /sys/class/backlight/rpi_backlight/bl_power
    else
    	xrandr --output HDMI-1 --auto
    fi
    /usr/bin/chromium-browser --kiosk "http://YOUR_SERVER_HOSTNAME/screensaver.html?search=Rating%2Cis at least%2C5&match=all&update_secs=30&kiosk=1" &

Script to stop the Chromium browser in the file /usr/local/bin/stop-photos.sh:

    #!/usr/bin/env bash
    set -x
    export DISPLAY=:0
    export XAUTHORITY=/home/pi/.Xauthority
    if [ -d /sys/class/backlight/rpi_backlight ] ; then
    	echo 1 > /sys/class/backlight/rpi_backlight/bl_power
    else
    	xrandr --output HDMI-1 --off
    fi
    killall chromium-browser

### Hardware button script

I added a button to the top of the case that allows manually toggling the power on the screen
and starting/stopping the Chromium browser. Code is placed in the file
/usr/local/bin/power_button.py:

    #!/usr/bin/env python3
    
    import argparse
    import subprocess
    import sys
    from gpiozero import Button
    
    def execute_command(command):
        subprocess.run([command], stdout=sys.stdout, stderr=sys.stderr, check=True)
    
    def wait_for_button_press(args):
        button = Button(args.pin)
    
        while True:
            if button.wait_for_press():
                execute_command(args.toggle_command)
    
    ARGPARSER = argparse.ArgumentParser()
    ARGPARSER.add_argument("--pin", type=int, default=17)
    ARGPARSER.add_argument("--toggle-command", default="/usr/local/bin/toggle-state.sh")
    ARGS = ARGPARSER.parse_args(sys.argv[1:])
    
    wait_for_button_press(ARGS)

Bash script /usr/local/bin/toggle-state.sh to toggle the screen state:

    #!/usr/bin/env bash
    
    if [ -d /sys/class/backlight/rpi_backlight ] ; then
    	DISABLED=$(cat /sys/class/backlight/rpi_backlight/bl_power)
    else
    	DISABLED=$(xrandr | grep "HDMI-1 connected primary (normal" | wc -l)
    fi
    
    if [ "${DISABLED}" = "1" ] ; then
    	/usr/local/bin/start-photos.sh
    else
    	/usr/local/bin/stop-photos.sh
    fi

## Systemd units

Systemd units to automatically toggle the power of the screen at specific times of day.

/etc/systemd/system/photos-button.service:

    [Unit]
    Description=GPIO Power Button
    After=network.target
    
    [Service]
    User=pi
    ExecStart=/usr/local/bin/power_button.py
    Environment=DISPLAY=:0
    Environment=XAUTHORITY=/home/pi/.Xauthority
    WorkingDirectory=/home/pi
    KillMode=process
    Restart=on-failure
    
    [Install]
    WantedBy=multi-user.target

/etc/systemd/system/photos-off.service:

    [Unit]
    Description=Power off photos
    After=network.target
    
    [Service]
    User=pi
    ExecStart=/usr/local/bin/stop-photos.sh
    KillMode=process
    Restart=on-failure
    
    [Install]
    WantedBy=multi-user.target

/etc/systemd/system/photos-off.timer:

    [Unit]
    Description=Power off photos
    
    [Timer]
    OnCalendar=*-*-* 20:00:00
    Persistent=true
    
    [Install]
    WantedBy=timers.target

/etc/systemd/system/photos-on.service:

    [Unit]
    Description=Power on photos
    After=network.target
    
    [Service]
    User=pi
    ExecStart=/usr/local/bin/start-photos.sh
    KillMode=process
    Restart=on-failure
    
    [Install]
    WantedBy=multi-user.target

/etc/systemd/system/photos-on.timer:

    [Unit]
    Description=Power on photos
    
    [Timer]
    OnCalendar=*-*-* 07:00:00
    Persistent=true
    
    [Install]
    WantedBy=timers.target

Enable the systemd units:

    sudo systemctl daemon-reload
    sudo systemctl enable --now photos-off.timer
    sudo systemctl enable --now photos-on.timer
    sudo systemctl enable --now photos-button.service

Configure the pi user to automatically start the photo site on startup via
/home/pi/.config/autostart/photos.desktop:

    [Desktop Entry]
    Type=Application
    Exec=/usr/local/bin/start-photos.sh

Use raspi-config to configure the system to automatically log in as the
`pi` username.

# Reboot

Reboot and Chromium should automatically start full screen on boot. Tap the screen to pause the
slideshow. Metadata about the photo will pop up on the bottom of the screen. You can swipe left
or right to manually change the photo that's shown. Tap the image again to continue the slideshow.
