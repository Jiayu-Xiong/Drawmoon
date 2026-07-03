# Styles Frontend Reference Guide

This file tells future agents how to use the reference frontends in:

```text
../styles
```

The zip files in that folder have already been extracted:

```text
styles\(UI)glass_style.zip
styles\(UI)glass_style\liquid-glass-apple\

styles\(FLow)workflow_status.zip
styles\(FLow)workflow_status\box-flow-system\
```

There are also two already-unpacked reference folders:

```text
styles\Layout_Template\
styles\FlowNode\
```

Use these as visual and interaction references only. Do not copy them wholesale into the product. The custom workflow frontend should remain its own Solid/Vite app under:

```text
xy\custom\workflow-frontend\
```

## The Four References

### 1. Main Interface

Reference:

```text
..\styles\(UI)glass_style\liquid-glass-apple\
```

Role:

This is the visual language reference for the main app shell.

Use it for:

- liquid/glass panel treatment
- layered blur, highlight, and specular effects
- floating dock-like controls
- soft translucent surfaces
- active/inactive icon states
- compact control clusters

Important files:

```text
index.html
style.css
script.js
```

Notes:

- The SVG filter `#lensFilter` is part of the glass effect.
- The original demo uses remote images and icon assets.
- For our app, recreate the effect with local CSS and stable layout primitives.
- Avoid overusing the glass effect. Use it for the shell, toolbar, node panels, and modals, not every tiny element.

How to translate it into the workflow frontend:

- Use a calm full-screen workspace background.
- Put top-level navigation and provider/session controls in translucent glass bars.
- Use glass panels for node editor, run logs, trace viewer, and settings.
- Keep text contrast high. The reference is decorative; our product must stay readable.

### 2. Expanded Main Interface

Reference:

```text
..\styles\Layout_Template\
```

Role:

This is the reference for the expanded main interface: a full app dashboard with navigation, search, primary content, and secondary side panels.

Use it for:

- full-width application shell
- top navigation density
- search/filter placement
- primary content plus right-side companion panel
- scrollable panel interiors
- responsive layout rhythm

Important files:

```text
index.html
style.css
script.js
```

Notes:

- It uses Tailwind CDN and remote images.
- The layout is a news feed, but the useful part is the shell composition.
- The main card plus right-side list maps well to workflow canvas plus inspector/log panel.

How to translate it into the workflow frontend:

- Treat the workflow canvas as the primary content area.
- Put provider status, run controls, and search/filter in the top band.
- Use the right side for the selected node editor, run status, or trace summary.
- Keep panels scrollable without moving the whole page.

Suggested product mapping:

```text
Layout_Template nav        -> workflow top toolbar
Layout_Template main card  -> workflow canvas
Layout_Template aside      -> selected node details / run logs
Layout_Template search     -> node/workflow search
```

### 3. Workflow Running State

Reference:

```text
..\styles\FlowNode\
```

Role:

This is the reference for a workflow execution/status visualization.

Use it for:

- node graph presentation during execution
- animated path reveal
- running/complete/error states along edges
- card-like workflow nodes
- plus buttons between nodes
- branch/fork visualization

Important files:

```text
index.html
style.css
script.js
```

Notes:

- It uses GSAP and ScrollTrigger from CDN.
- Do not add GSAP just because this demo uses it. Prefer CSS/Solid state transitions unless the animation truly needs a timeline library.
- The key idea is not the exact animation library; it is the readable flow of nodes and edges.

How to translate it into the workflow frontend:

- Show active edges while a workflow is running.
- Give each node a clear status: queued, running, success, failed, cached, skipped.
- Use animated edge strokes for active execution.
- Use small badges for provider, cache mode, duration, and session mode.
- Keep the graph usable while running; do not make it a pure cinematic view.

Suggested product mapping:

```text
connector-dot -> node input/output port
line-path     -> workflow edge
plus-btn      -> insert node action
card          -> workflow node
card-stats    -> run metadata row
```

### 4. Workflow Editing Interface

Reference:

```text
..\styles\(FLow)workflow_status\box-flow-system\
```

Role:

This is the reference for the workflow editing canvas.

Use it for:

- large pannable workspace
- dev/edit mode toggle
- adding/removing objects
- draggable elements
- save/load config behavior
- visible edit affordances only while editing

Important files:

```text
index.html
style.css
script.js
```

Notes:

- This demo is a pixel conveyor/box system, not a workflow editor.
- The useful part is the interaction model: pan, add, drag, delete, save config, upload config.
- Its code is plain DOM OOP. Do not port it directly into Solid.

How to translate it into the workflow frontend:

- Use a large canvas area with pan and zoom.
- Add an explicit edit/run mode.
- Show insert/delete handles only in edit mode.
- Make node positions part of the workflow JSON.
- Support import/export of workflow config.
- Keep drag behavior deterministic and avoid accidental edits while a run is active.

Suggested product mapping:

```text
dev mode          -> edit mode
add belt/tube/box -> add node / add edge / add group
delete mode       -> delete node/edge mode
upload config     -> import workflow
download config   -> export workflow
wrapper drag      -> canvas pan
world config      -> workflow graph JSON
```

## Design Direction For Our Frontend

The final frontend should combine the references like this:

```text
Main shell:        liquid-glass-apple
Expanded layout:   Layout_Template
Running graph:     FlowNode
Editing canvas:    box-flow-system
```

Build a real workflow tool, not a demo collage.

The user should land directly in the usable workflow experience:

- canvas in the center
- toolbar at the top
- selected node editor on one side
- run log / trace / cache inspector in another panel or tab
- provider status visible but not dominant

## Implementation Rules

1. Work inside:

```text
xy\custom\workflow-frontend\
```

2. Do not modify:

```text
xy\packages\app\
xy\packages\web\
xy\packages\ui\
xy\packages\opencode\
```

3. Do not copy entire reference HTML/CSS/JS files.

Extract ideas:

- layout structure
- spacing rhythm
- glass surface treatment
- node card composition
- canvas interaction patterns
- status animation behavior

Then rebuild them in the existing Solid frontend.

4. Avoid remote assets in the product.

The references use remote images/CDNs. The workflow frontend should use local CSS, local icons, or package dependencies already installed in the custom frontend.

5. Keep frontend text functional.

Do not add marketing copy or demo explanations inside the app. The UI should behave like a tool.

6. Keep controls concrete.

Use icon buttons, toggles, tabs, menus, and compact panels. Avoid oversized hero sections or landing-page composition.

7. Keep layout stable.

Node cards, toolbars, ports, badges, and log rows should have stable dimensions so running state changes do not jump the layout.

## Suggested Next Agent Task

Start by refactoring the current `custom/workflow-frontend` UI into this structure:

```text
AppLayout
  TopToolbar
  WorkflowWorkspace
    WorkflowCanvas
    NodeCard
    EdgeLayer
  SideInspector
    NodeEditor
    RunLog
    TraceViewer
    CacheInspector
  ProviderStatus
```

Then apply the references in this order:

1. Use `liquid-glass-apple` for the shell surfaces and toolbar.
2. Use `Layout_Template` for the expanded dashboard layout.
3. Use `box-flow-system` for canvas edit mode interactions.
4. Use `FlowNode` for running state edges, node status, and execution animation.

The first milestone is not visual perfection. The first milestone is:

- create/edit a workflow node
- run it through `http://127.0.0.1:3456/nodes/run`
- stream logs
- display result/cache/trace
- make the interface look directionally aligned with the references

