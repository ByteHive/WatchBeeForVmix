const chokidar = require('chokidar');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Get the directory where the executable is located
const getExeDir = () => {
    // When packaged with pkg, process.pkg is defined
    if (process.pkg) {
        return path.dirname(process.execPath);
    }
    return __dirname;
};

// Load configuration
let config;
try {
    const configPath = path.join(getExeDir(), 'config.json');
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
    // Default configuration if config.json is not found
    config = {
        folderToWatch: './media',
        vmixUrl: 'http://localhost:8088',
        playlistName: 'List',
        supportedExtensions: ['.mp4', '.mov', '.wmv', '.avi', '.mpg', '.mpeg']
    };
    
    // Create default config file if it doesn't exist
    try {
        fs.writeFileSync(
            path.join(getExeDir(), 'config.json'), 
            JSON.stringify(config, null, 2)
        );
        console.log('Created default config.json');
    } catch (writeError) {
        console.error('Failed to create default config.json:', writeError.message);
    }
}

// Initialize watcher
const watcher = chokidar.watch(config.folderToWatch, {
    ignored: /(^|[\/\\])\../, // ignore hidden files
    persistent: true,
    awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
    }
});

// Helper function to parse XML response
async function getVmixState() {
    try {
        const response = await axios.get(`${config.vmixUrl}/api`);
        return response.data;
    } catch (error) {
        console.error(`Error getting vMix state: ${error.message}`);
        return null;
    }
}

// Helper function to find list items for a specific input
function findListItems(xmlText, absolutePath) {
    try {
        const listMatch = xmlText.match(/<input[^>]*type="VideoList"[^>]*>[\s\S]*?<list>([\s\S]*?)<\/list>/g);
        
        if (listMatch) {
            for (const list of listMatch) {
                const items = list.match(/<item[^>]*>(.*?)<\/item>/g);
                if (items) {
                    const index = items.findIndex(item => item.includes(absolutePath)) + 1;
                    if (index > 0) {
                        const titleMatch = list.match(/title="([^"]*?)"/);
                        const inputName = titleMatch ? titleMatch[1] : 'List';
                        return { index, inputName };
                    }
                }
            }
        }
        return null;
    } catch (error) {
        console.error(`Error parsing XML: ${error.message}`);
        return null;
    }
}

// Helper function to add file to vMix playlist
async function addToVmixPlaylist(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    
    if (!config.supportedExtensions.includes(extension)) {
        console.log(`Ignoring file ${filePath} - unsupported format`);
        return;
    }

    try {
        const absolutePath = path.resolve(filePath);
        const encodedPath = encodeURIComponent(absolutePath);
        const url = `${config.vmixUrl}/api/?Function=ListAdd&Input=${config.playlistName}&Value=${encodedPath}`;
        await axios.get(url);
        console.log(`Added ${absolutePath} to vMix playlist`);
    } catch (error) {
        console.error(`Error adding file to vMix: ${error.message}`);
    }
}

// Helper function to remove file from vMix playlist
async function removeFromVmixPlaylist(filePath) {
    try {
        const absolutePath = path.resolve(filePath);

        const xmlState = await getVmixState();
        if (!xmlState) return;

        const fileInfo = findListItems(xmlState, absolutePath);

        if (fileInfo) {
            const url = `${config.vmixUrl}/api/?Function=ListRemove&Input=${encodeURIComponent(fileInfo.inputName)}&Value=${fileInfo.index}`;
            await axios.get(url);
            console.log(`Removed ${absolutePath} from vMix playlist "${fileInfo.inputName}" at index ${fileInfo.index}`);
        } else {
            console.log(`File ${absolutePath} not found in any vMix playlist`);
        }
    } catch (error) {
        console.error(`Error removing file from vMix: ${error.message}`);
    }
}

// Helper function to get all items from a VideoList
function getAllListItems(xmlText, playlistName) {
    try {
        // Find the specific VideoList by name
        const inputRegex = new RegExp(`<input[^>]*title="${playlistName}"[^>]*type="VideoList"[^>]*>[\\s\\S]*?<list>([\\s\\S]*?)<\\/list>`, 'i');
        const inputMatch = xmlText.match(inputRegex);

        if (!inputMatch) {
            return [];
        }

        const listContent = inputMatch[1];
        const items = listContent.match(/<item[^>]*>(.*?)<\/item>/g);

        if (!items) {
            return [];
        }

        // Extract the file paths from items
        return items.map(item => {
            const match = item.match(/<item[^>]*>(.*?)<\/item>/);
            return match ? match[1] : '';
        }).filter(item => item !== '');
    } catch (error) {
        console.error(`Error parsing list items: ${error.message}`);
        return [];
    }
}

// Helper function to sort the VMix playlist alphabetically
async function sortVmixPlaylist() {
    try {
        const xmlState = await getVmixState();
        if (!xmlState) return;

        // Get all items from the playlist
        const items = getAllListItems(xmlState, config.playlistName);

        if (items.length === 0) {
            return;
        }

        // Sort items alphabetically by filename (not full path)
        const sortedItems = items.sort((a, b) => {
            const filenameA = path.basename(a).toLowerCase();
            const filenameB = path.basename(b).toLowerCase();
            return filenameA.localeCompare(filenameB);
        });

        // Check if the list is already sorted
        const isSorted = items.every((item, index) => item === sortedItems[index]);
        if (isSorted) {
            console.log('Playlist is already sorted');
            return;
        }

        // Remove all items from the list
        const removeAllUrl = `${config.vmixUrl}/api/?Function=ListRemoveAll&Input=${encodeURIComponent(config.playlistName)}`;
        await axios.get(removeAllUrl);

        // Add items back in sorted order
        for (const item of sortedItems) {
            const encodedPath = encodeURIComponent(item);
            const addUrl = `${config.vmixUrl}/api/?Function=ListAdd&Input=${config.playlistName}&Value=${encodedPath}`;
            await axios.get(addUrl);
        }

        console.log(`Sorted ${sortedItems.length} items in VMix playlist alphabetically`);
    } catch (error) {
        console.error(`Error sorting VMix playlist: ${error.message}`);
    }
}

// Watch for file events
watcher
    .on('add', async path => {
        console.log(`File ${path} has been added`);
        await addToVmixPlaylist(path);
        await sortVmixPlaylist();
    })
    .on('unlink', async path => {
        console.log(`File ${path} has been removed`);
        await removeFromVmixPlaylist(path);
        await sortVmixPlaylist();
    })
    .on('change', async path => {
        console.log(`File ${path} has been changed`);
        await addToVmixPlaylist(path);
        await sortVmixPlaylist();
    })
    .on('rename', async (oldPath, newPath) => {
        console.log(`File renamed from ${oldPath} to ${newPath}`);
        await removeFromVmixPlaylist(oldPath);
        await addToVmixPlaylist(newPath);
        await sortVmixPlaylist();
    })
    .on('error', error => {
        console.error(`Watcher error: ${error}`);
    });

// Log that we're running
console.log('Configuration:', config);
console.log(`Watching ${config.folderToWatch} for changes...`);
console.log(`vMix API URL: ${config.vmixUrl}`);
console.log(`Supported file types: ${config.supportedExtensions.join(', ')}`);