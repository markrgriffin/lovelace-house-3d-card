# Changelog

## 1.0.1 — 2026-10-08
- Export / import: new **Keep my placed entities** option (on by default). Importing a layout then replaces rooms, doors, colours and the plan image but keeps the lights, sockets and thermostats you have already positioned.

## 1.0.0 — 2026-09-23
- First release. Rotatable 3D house with live lights (colour + brightness lighting), sockets (red/green LED), climate chips with target/current and a −/+ popup.
- Edit mode: place entities, per-room floor texture/colour and wall colour, wall height, doors, draggable wall corners, camera default.
- Floor-plan image tracing: show any image from `/config/www` on the ground and draw rooms over it corner by corner.
- Layout stored in Home Assistant (shared by all users, falls back to per-user on older cores). Export/import as JSON.
- Single-file bundle including three.js — no CDN, works offline.
