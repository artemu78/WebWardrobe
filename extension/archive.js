const { spawnSync } = require("child_process");
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

const ARCHIVE_FOLDER = 'archives';
const extensionFiles = ["manifest.json", "content.js", "popup.js", "popup.html", "background.js", "input.css", "logo.jpg", "style.css"];

function prepareFolder() {
  const archivePath = path.join(__dirname, ARCHIVE_FOLDER);
  if (!fs.existsSync(archivePath)) {
    fs.mkdirSync(archivePath);
  }
  return archivePath;
}

function getVersion() {
  const packageJson = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const version = packageJson.version;
  return version;
}

// Function to compress specified files and folders into a zip file
function compressAssets() {
  // Run tests first
  console.log("Running tests...");
  const testResult = spawnSync("npm", ["run", "test"], {
    stdio: ['inherit', 'inherit', 'inherit']
  });

  if (testResult.status !== 0) {
    console.error("Tests failed. Aborting archive creation.");
    process.exit(1);
  }

  spawnSync("node", ["bump-version"], {
    stdio: ['inherit', 'inherit', 'inherit'] // Inherit stdio from parent process
  });

  const archivePath = prepareFolder();
  const version = getVersion();

  // Output file name includes the version from package.json
  const archiveName = `web-wardrobe-chrome-extension-v${version}.zip`;
  const outputFileName = path.join(archivePath, archiveName);
  const output = fs.createWriteStream(outputFileName);
  const archive = archiver('zip', {
    zlib: { level: 9 } // Compression level
  });

  output.on('close', function () {
    console.log(`Archive ${outputFileName} has been created successfully. Total bytes: ${archive.pointer()}`);
  });

  archive.on('error', function (err) {
    throw err;
  });

  // Pipe archive data to the file
  archive.pipe(output);

  // Add files and folders to the archive
  extensionFiles.forEach((name) => {
    archive.file(name, { name });
  });

  // Add the icons folder and dist folder recursively
  archive.directory('icons/', 'icons');
  // archive.directory('dist/', 'dist');

  // Finalize the archive (i.e., finish writing the zip file)
  archive.finalize();
}

compressAssets();
