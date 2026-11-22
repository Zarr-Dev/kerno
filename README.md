# Kerno

**All-in-One Operating System Builder IDE**

Kerno is a website-first IDE concept for creating, configuring, building, and testing operating systems in one focused workspace.

## Current status

This repository starts with the **frontend foundation and interactive UI prototype**. The current Build & Boot and emulator controls are demonstrative UI states only; they do not compile a kernel, create a bootable ISO, or launch QEMU yet.

## Design decisions

- Vanilla HTML, CSS, and JavaScript (no frontend framework or bundler)
- Dark theme by default
- Monaco Editor for the code workspace
- Balanced density inspired by professional desktop IDEs
- Responsive, resizable IDE panels

## Run locally

Because Monaco loads its browser editor assets from a CDN, serve this folder over HTTP rather than opening `index.html` as a local file.

For example:

```bash
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

An internet connection is required for the Monaco CDN assets.

## Frontend structure

```text
kerno/
├── index.html
├── styles.css
├── script.js
└── README.md
```

## Architecture boundary

A normal browser page cannot directly execute native programs such as NASM, a linker, GRUB tooling, or QEMU. Real builds and emulation will require a separately designed local execution service or another explicitly authorized backend. The frontend is being developed independently first, with that integration boundary kept clear.

## Roadmap

1. Frontend shell, project launcher, editor, panels, and responsive layout
2. Workspace and project file APIs
3. Native toolchain orchestration and asynchronous build logs
4. QEMU lifecycle management and emulator streaming
5. Real ISO export and production hardening

## License

To be decided.
