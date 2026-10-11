# Changelog

## 1.1.0 — 2026-10-11
- **Furniture.** A built-in catalogue of 36 low-poly pieces (sofas, chairs, tables, beds, storage, TV, fireplace, chimney breast, mirrors, pictures, plants, lamps, rugs, curtains, radiators, doors, windows, sockets, switches…), lit by the room's lights. Add, move, rotate, resize, recolour, duplicate and delete in edit mode. Wall-hung items stay on their wall and hide when it faces away. Lamps can be linked to a light entity: the shade glows in its colour and tapping toggles it.
- **Furnish from photos** (administrators): photograph each wall, tap its corners, and Home Assistant's AI Task identifies the furniture, wall colours and floor; review and correct the boxes on the photos, then place everything in 3D. Photos are re-encoded as JPEG and uploaded to local media. Optional photo mode sets the room's lights to neutral white and restores them afterwards.
- **Per-wall colours** in each room.
- Export / import: new **Keep my furniture** option.
- New card options `ai_task_entity` and `ai_bbox_format`.

## 1.0.1 — 2026-10-08
- Export / import: new **Keep my placed entities** option (on by default). Importing a layout then replaces rooms, doors, colours and the plan image but keeps the lights, sockets and thermostats you have already positioned.

## 1.0.0 — 2026-09-23
- First release. Rotatable 3D house with live lights (colour + brightness lighting), sockets (red/green LED), climate chips with target/current and a −/+ popup.
- Edit mode: place entities, per-room floor texture/colour and wall colour, wall height, doors, draggable wall corners, camera default.
- Floor-plan image tracing: show any image from `/config/www` on the ground and draw rooms over it corner by corner.
- Layout stored in Home Assistant (shared by all users, falls back to per-user on older cores). Export/import as JSON.
- Single-file bundle including three.js — no CDN, works offline.
