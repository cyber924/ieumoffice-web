# IeumOffice Web — Word & HWP/HWPX

Browser-first workspace for Korean documents and form-heavy DOCX / HWP / HWPX files.

## Source
Based on [IeumOffice v0.13.2](https://github.com/pblsketch/ieumoffice/releases/tag/v0.13.2), which itself is based on [GenOffice](https://github.com/genspark-ai/genoffice). The upstream software uses the Apache License 2.0; copyright and attribution must be retained.

## Scope (first release)
- DOCX and HWP/HWPX editors only.
- Preserve tables, merged cells, paper size, margins and existing document layout.
- AI assistant docked at left; editable document at right.
- Work locally in the browser before adding authentication or storage.

## Repository approach
- Keep upstream source pinned to v0.13.2.
- Isolate web adaptations, avoiding changes to the upstream project.
- Validate opening, editing and re-opening real-world documents before claiming compatibility.

Current status: repository initialized; source migration and browser adapters in progress.
