import { DirEntry } from './utils/utils.ts'

export default (entries: DirEntry[], path: string) => {

    entries.map(each=>each.name.split(".").slice(0,-1).join())
    let sorted = entries.sort(
        (x) => (x.isDirectory ? -1 : 1)
    )
    // sorting by name
    sorted = sorted.sort(
        (a: DirEntry, b: DirEntry) : any => {
            const aRealName = a.name.split(".").slice(0,-1).join(".")
            const bRealName = b.name.split(".").slice(0,-1).join(".")
            return aRealName.localeCompare(bRealName)
        }
    )
    // sorting by extension
    sorted = sorted.sort(
        (a: DirEntry, b: DirEntry) : any => {
            const aExtension = a.name.split(".").slice(-1,)[0]
            const bExtension = b.name.split(".").slice(-1,)[0]
            return aExtension.localeCompare(bExtension)
        }
    )
    // sorting by hidden is top priority
    sorted = sorted.sort(
        (x) => (x.name.startsWith(".") ? -1 : 1)
    )
    
    const elementGenerator = ({isForFiles=false})=>
        sorted
            .filter(entry=>isForFiles? entry.isFile : !entry.isFile)
            .map(
                (entry) =>
                    `
                    <a
                        class="entry"
                        href="${entry.url}" 
                        class="${isForFiles ? 'file' : 'directory'}" 
                        >
                            <span class="entry-name">${entry.name}${isForFiles?"":"/"}</span>
                            <span class="entry-extension">${!entry.name.match(/\./)?"" : entry.name.split(".").slice(-1)[0] }</span>
                    </a>
                `
            )
            .join('')
    return `
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <meta charset="utf-8" />
                <title>archaeopteryx - ${path}</title>
            </head>
            <style>
                :root {
                        --text: #424242;
                        --background: #fff;
                        --background-highlight: whitesmoke;
                        --text-highlight: #a8a6b3;
                        --title: #4a5560;
                }

                @media (prefers-color-scheme: dark) {
                    :root {
                        --background: #2b333b;
                        --background-highlight: #3f4b57;
                        --text: #c1c3c4;
                        --text-highlight: #fff;
                        --title: #4a5560;
                    }
                }

                html,
                    body {
                        height: 100%;
                        width: 100%;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
                        -webkit-font-smoothing: antialiased;
                        box-sizing: border-box;
                        background: var(--background);
                        margin: 0;
                    }
                    
                    #archaeopteryx {
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: start;
                        margin: 0 auto;
                                max-width:1280px;
                        padding: 4rem;
                        padding-top: 1rem;
                        padding-bottom: 1rem;

                    }
                    
                    #archaeopteryx > h1 {
                        font-size: 36px;
                        margin-bottom: 0;
                        color: var(--title);
                        align-self: flex-start;
                    }
                    
                    strong {
                        opacity: 0.2;
                        font-weight: 200;
                    }

                    a {
                        text-decoration: none;
                        position: relative;
                        color: var(--text);
                        font-size: 14px;
                        font-style: bold;
                        font-family:
                        "SFMono-Regular",
                        Consolas,
                        "Liberation Mono",
                        Menlo,
                        Courier,
                        monospace;
                    }

                .contents {
                    display: flex;
                    flex-direction: row;
                    gap: 2rem;
                    margin-top: 1.5rem;
                    align-content: space-evenly;
                    justify-content: space-evenly;
                }

                .folder-contents, .file-contents {
                    display: flex;
                    flex-direction: column;
                    gap: 0.4rem;
                }
                
                .entry {
                    display: flex;
                    flex-direction: row;
                    min-width: 10rem;
                    padding: 0.7rem;
                    background: var(--background);
                    justify-content: space-between;
                    align-items: center;
                    transition: all 0.2s ease-in-out 0s;
                }
                .entry:hover {
                    background: var(--background-highlight);
                }
                .entry:hover a {
                    color: var(--text-highlight);
                }
                .entry::before {
                    content: "";
                    width: 4px;
                    height: 0%;
                    background: #f27a3a;
                    display: block;
                    position: absolute;
                    top: 0;
                    left: -8px;
                    transition: 0.3s cubic-bezier(0.17, 0.67, 0.16, 0.99);
                }
                .entry:hover::before {
                    height: 100%;
                    transition: 0.3s cubic-bezier(0.17, 0.67, 0.16, 0.99);
                }
                
                .entry-name {
                    word-wrap: anywhere;
                }
                
                .entry-extension {
                    padding: 0.2rem;
                    opacity: 0.3;
                    border-radius: 0.1rem;
                    color: var(--background);
                    background: var(--text);
                    margin-left: 10px;
                }
            </style>
            <body>
                <div id="archaeopteryx">
                    <h1>${path}</h1>
                    <div class="contents">
                        <div class="folder-contents">
                            ${elementGenerator({isForFiles:false})}
                        </div>
                        <div class="file-contents">
                            ${elementGenerator({isForFiles:true})}
                        </div>
                    </div>
                </div>
            </body>
        </html>
    `
}
