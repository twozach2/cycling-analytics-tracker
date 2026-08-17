# Generated BRouter runtime

`npm run prepare:brouter-runtime` places the pinned BRouter server JAR, routing profiles, license, and a native minimal Java runtime in this directory before desktop packaging.

Generated binaries are intentionally excluded from Git. Release jobs rebuild them from BRouter `v1.7.10` at commit `4d2639af77ea5ed9c30d3e400764eb6f9e8522da`. Regional `.rd5` OpenStreetMap/elevation files are never packaged; the rider downloads them explicitly into private application data and can remove them from the app.
