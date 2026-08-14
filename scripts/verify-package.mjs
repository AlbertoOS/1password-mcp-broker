import { execFileSync } from "node:child_process";

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error("npm_execpath is required to verify the npm package surface");
}

const output = execFileSync(process.execPath, [npmCli, "pack", "--dry-run", "--json", "--ignore-scripts"], {
  encoding: "utf8",
});
const [packageInfo] = JSON.parse(output);
const packagedPaths = packageInfo.files.map((file) => file.path).sort();
const allowedRootFiles = new Set(["LICENSE", "README.md", "SECURITY.md", "package.json"]);
const unexpected = packagedPaths.filter(
  (path) => !allowedRootFiles.has(path) && !path.startsWith("dist/"),
);

if (unexpected.length > 0) {
  throw new Error(`Unexpected files in npm package: ${unexpected.join(", ")}`);
}
if (!packagedPaths.some((path) => path.startsWith("dist/"))) {
  throw new Error("npm package has no compiled dist/ files");
}

console.log(`package_surface=valid files=${packagedPaths.length}`);
