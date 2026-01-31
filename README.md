# quick-transport


## Setup
Setup is easy! This requires Bun and Git to be installed. This will install and host the server.: 
```bash
git clone https://github.com/galacticSystemsInDevelopment/quick-transport
cd quick-transport
bun install
bun generate.ts
```
To run in the background, replace:
```bash
bun generate.ts
```
with:
```bash
nohup bun generate.ts &
```
## Start after Generated
To start after generated, run this command with the directory the repo is cloned in:
```bash
bun start.ts
```
