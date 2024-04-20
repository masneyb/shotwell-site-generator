# Photo Frame

![Photo Frame Back](../screenshots/photo-frame-back.jpg?raw=1)

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

![Photo Frame Front](../screenshots/photo-frame-front.jpg?raw=1)

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

- Script to start the Chromium browser in kiosk mode. Be sure to update your URL in the
  start-photos.sh script.
  - [/etc/systemd/system/photos-off.service](etc/systemd/system/photos-off.service)
  - [/etc/systemd/system/photos-off.timer](etc/systemd/system/photos-off.timer)
  - [/etc/systemd/system/photos-on.service](etc/systemd/system/photos-on.service)
  - [/etc/systemd/system/photos-on.timer](etc/systemd/system/photos-on.timer)
  - [/usr/local/bin/start-photos.sh](usr/local/bin/start-photos.sh)
  - [/usr/local/bin/stop-photos.sh](usr/local/bin/stop-photos.sh)

- I added a button to the top of the case that allows manually toggling the power on the screen
  and starting/stopping the Chromium browser.
  - [/etc/systemd/system/photos-button.service](etc/systemd/system/photos-button.service)
  - [/usr/local/bin/power_button.py](usr/local/bin/power_button.py)
  - [/usr/local/bin/toggle-state.sh](usr/local/bin/toggle-state.sh)

- Configure the pi user to automatically start the photo site on startup.
  - [/home/pi/.config/autostart/photos.desktop](home/pi/.config/autostart/photos.desktop)


Enable the systemd units:

    sudo systemctl daemon-reload
    sudo systemctl enable --now photos-off.timer
    sudo systemctl enable --now photos-on.timer
    sudo systemctl enable --now photos-button.service

Use `raspi-config` to configure the system to automatically log in as the
`pi` username.

# Reboot

Reboot and Chromium should automatically start full screen on boot. Tap the screen to pause the
slideshow. Metadata about the photo will pop up on the bottom of the screen. You can swipe left
or right to manually change the photo that's shown. Tap the image again to continue the slideshow.

[Back to main page](../README.md)
