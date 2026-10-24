#!/usr/bin/env python3
"""Build the existing Vite UI and embed its dist files as JUCE WebView resources."""
import os, pathlib, subprocess, sys, mimetypes

project = pathlib.Path(sys.argv[1]).resolve()
output = pathlib.Path(sys.argv[2]).resolve()
exe = "npm.cmd" if os.name == "nt" else "npm"
if not (project / "package.json").exists():
    raise SystemExit(f"Missing package.json in {project}")
subprocess.run([exe, "install"], cwd=project, check=True)
subprocess.run([exe, "run", "build"], cwd=project, check=True)
dist = project / "dist"
if not dist.is_dir():
    raise SystemExit("Vite build did not produce dist/")
files = sorted(p for p in dist.rglob("*") if p.is_file())
if not files:
    raise SystemExit("dist/ is empty")

def cpp_bytes(data):
    return ",".join(f"std::byte{{0x{b:02x}}}" for b in data)

lines = ['#include <JuceHeader.h>', '#include <optional>', '#include <vector>', '#include <string>', '#include <cstring>', '',
         'std::optional<juce::WebBrowserComponent::Resource> getReReBirthWebResource (const juce::String& requestedPath)', '{',
         '    auto path = requestedPath.trimCharactersAtStart ("/").replace ("\\\\", "/");',
         '    if (path.isEmpty()) path = "index.html";', '    path = path.replace ("..", "");']
for i, path in enumerate(files):
    rel = path.relative_to(dist).as_posix()
    data = path.read_bytes()
    mime = mimetypes.guess_type(rel)[0] or 'application/octet-stream'
    lines.append(f'    if (path == "{rel}") {{')
    # split into lines of 24 bytes to avoid excessive compiler line length
    lines.append('        static const unsigned char bytes[] = {')
    for start in range(0, len(data), 24):
        lines.append('            ' + ','.join(f'0x{b:02x}' for b in data[start:start+24]) + ',')
    lines.append('        };')
    lines.append(f'        std::vector<std::byte> payload (sizeof(bytes));')
    lines.append('        std::memcpy (payload.data(), bytes, sizeof(bytes));')
    lines.append(f'        return juce::WebBrowserComponent::Resource {{ std::move(payload), "{mime}" }};')
    lines.append('    }')
lines += ['    return std::nullopt;', '}', '']
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text('\n'.join(lines), encoding='utf-8')
print(f"Embedded {len(files)} web assets into {output}")


