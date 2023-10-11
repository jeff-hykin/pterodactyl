const { args } = Deno
import * as Path from "https://deno.land/std@0.128.0/path/mod.ts"
import {
  parse,
  acceptWebSocket,
  serve,
  Server,
  serveTLS,
  ServerRequest,
  posix,
} from './deps.ts'

/* Archaeopteryx utils */
import {
  isRoute,
  isValidArg,
  printHelp,
  readFile,
  isWebSocket,
  appendReloadScript,
  printStart,
  printRequest,
  error,
  isValidPort,
  inject404,
  setHeaders,
  encode,
  decode,
  info,
  prompt,
  joinPath,
  DirEntry,
  pipe,
} from './utils/utils.ts'

import { html, css, logo } from './utils/boilerplate.ts'
import { getNetworkAddr } from './utils/local-ip.ts'
import dirTemplate from './directory.ts'
import { InterceptorException } from './utils/errors.ts'

type ArchaeopteryxOptions = {
  root?: string
  port?: number
  silent?: boolean
  disableReload?: boolean
  debug?: boolean
  cors?: boolean
  secure?: boolean
  help?: boolean
  dontList?: boolean
  certFile?: string
  keyFile?: string
  entryPoint?: string
  before?: string | Interceptor | Interceptor[]
  after?: string | Interceptor | Interceptor[]
}

type Interceptor = (r: ServerRequest) => ServerRequest

/* Initialize file watcher */
let watcher: Deno.FsWatcher

/* Server */
let server: Server

/* Globals */
let root = '.'
let port = 8080
let debug = false
let silent = false
let disableReload = false
let secure = false
let help = false
let cors = false
let dontList = false
let certFile = 'archaeopteryx.crt'
let keyFile = 'archaeopteryx.key'
let entryPoint = 'index.html'
let before: Array<Interceptor> | Interceptor
let after: Array<Interceptor> | Interceptor

// is caught
const handleFileRequest = async (req: ServerRequest) => {
  try {
    const path = joinPath(root, unescape(req.url))
    const file = await Deno.open(path)
    req.done.then(() => {
      file.close()
    })
    // is caught 
    return await req.respond({
      status: 200,
      headers: setHeaders(cors, path),
      body: file,
    })
  } catch (err) {
    !silent && debug ? console.error(err) : error(err.message)
    // is caught
    await handleNotFound(req)
  }
}

// is caught
const handleRouteRequest = async (req: ServerRequest): Promise<void> => {
  try {
    const file = await readFile(`${root}/${entryPoint}`)
    const { hostname, port } = req.conn.localAddr as Deno.NetAddr
    // is caught
    await req.respond({
      status: 200,
      headers: setHeaders(cors),
      body: disableReload
        ? file
        : appendReloadScript(file, port, hostname, secure),
    })
  } catch (err) {
    !silent && debug ? console.error(err) : error(err.message)
    // is caught
    await handleDirRequest(req)
  }
}

// is caught
const handleDirRequest = async (req: ServerRequest): Promise<void> => {
  const path = joinPath(root, unescape(req.url))
  const dirUrl = `/${posix.relative(root, path)}`
  const entries: DirEntry[] = []
  for await (const entry of Deno.readDir(path.replace(/\/$/, ''))) {
    const filePath = posix.join(dirUrl, '/', entry.name)
    entries.push({ ...entry, url: decodeURIComponent(filePath) })
  }

  await req.respond({
    status: 200,
    body: encode(dirTemplate(entries, dirUrl)),
    headers: setHeaders(cors),
  })
}

const handleWs = async (req: ServerRequest): Promise<void> => {
  if (!watcher) {
    watcher = Deno.watchFs(root, { recursive: true })
  }
  try {
    const { conn, r: bufReader, w: bufWriter, headers } = req
    const socket = await acceptWebSocket({
      conn,
      bufReader,
      bufWriter,
      headers,
    })

    for await (const event of watcher) {
      if (event.kind === 'modify') {
        await socket.send('reload')
      }
    }
  } catch (err) {
    !silent && error(err.message)
  }
}

// is caught
const handleNotFound = async (req: ServerRequest): Promise<void> => {
  return req.respond({
    status: 404,
    headers: setHeaders(cors),
    body: inject404(req.url),
  })
}

const router = async (req: ServerRequest): Promise<void> => {
  try {
    if (!(req instanceof ServerRequest)) {
      throw new InterceptorException()
    }
    printRequest(req)
    if (!disableReload && isWebSocket(req)) {
      return await handleWs(req)
    }
    if (req.method === 'GET' && req.url === '/') {
      // is caught
      return await handleRouteRequest(req)
    }
    const path = joinPath(root, unescape(req.url))
    const itemInfo = await Deno.stat(path)
    
    if (itemInfo.isDirectory) {
        if (!dontList) {
            return await handleDirRequest(req)
        } else {
            // is caught
            return await handleNotFound(req)
        }
    } else {
        return await handleFileRequest(req)
    }
  } catch (err) {
    try {
        // is caught
        err instanceof Deno.errors.NotFound && await handleNotFound(req)
    } catch (error) {
        !silent && debug ? console.log(error) : error(error.message)
    }
    !silent && debug ? console.log(err) : error(err.message)
    err instanceof InterceptorException && Deno.exit()
  }
}

const checkCredentials = async () => {
  const pathToCert = Path.isAbsolute(certFile) ? certFile : `${root}/${certFile}`
  const pathToKey  = Path.isAbsolute(keyFile)  ? keyFile  : `${root}/${keyFile}`
  const certExists = await Deno.stat(pathToCert).catch(error=>null)
  const keyExists = await Deno.stat(pathToKey).catch(error=>null)
  if (!certExists || !keyExists) {
    if (!certExists) {
        console.error(`I was unable to find a cert file at ${JSON.stringify(pathToCert)}`)
    }
    if (!keyExists) {
        console.error(`I was unable to find a key file at ${JSON.stringify(pathToCert)}`)
    }
    Deno.exit(1)
  }
}

const callInterceptors = (
  req: ServerRequest,
  funcs: Interceptor[] | Interceptor
) => {
  const fns = Array.isArray(funcs) ? funcs : [funcs]
  const pipeline = pipe(...fns)
  return pipeline(req)
}

const startListener = async (
  handler: (req: ServerRequest) => void
): Promise<void> => {
  try {
    for await (const req of server) {
      before ? handler(await callInterceptors(req, before)) : handler(req)
      after && callInterceptors(req, after)
    }
  } catch (err) {
    !silent && debug ? console.error(err) : error(err.message)
  }
}

const setGlobals = async (args: ArchaeopteryxOptions): Promise<void> => {
  root = args.root ?? '.'
  help = args.help ?? false
  debug = args.debug ?? false
  silent = args.silent ?? false
  disableReload = args.disableReload ?? false
  port = args.port ?? 8080
  secure = args.secure ?? false
  cors = args.cors ?? false
  dontList = args.dontList ?? false
  certFile = args.certFile ?? 'archaeopteryx.crt'
  keyFile = args.keyFile ?? 'archaeopteryx.key'
  entryPoint = args.entryPoint ?? 'index.html'

  if (args.before) {
    if (typeof args.before === 'function') {
      before = args.before
    } else {
      try {
        const path = posix.resolve(`${root}/${args.before}`)
        const interceptors = await import(path)
        before = interceptors.default
      } catch (err) {
        !silent && debug ? console.error(err) : error(err.message)
      }
    }
  }

  if (args.after) {
    if (typeof args.after === 'function') {
      before = args.after
    } else {
      try {
        const path = posix.resolve(`${root}/${args.after}`)
        const interceptors = await import(path)
        after = interceptors.default
      } catch (err) {
        !silent && debug ? console.error(err) : error(err.message)
      }
    }
  }
}

const makeBoilerplate = async (path: string, name: string) => {
  await Deno.mkdir(`${path}/${name}`, { recursive: true })
  const htmlData = encode(html(name))
  const cssData = encode(css())
  const svgData = encode(logo())

  await Deno.writeFile(`${path}/${name}/index.html`, htmlData)
  await Deno.writeFile(`${path}/${name}/index.css`, cssData)
  await Deno.writeFile(`${path}/${name}/logo.svg`, svgData)
  await Deno.writeFile(`${path}/${name}/app.js`, encode(''))
}

/**
 * Serve a directory over HTTP/HTTPS
 *
 *     const options = { port: 8000, cors: true };
 *     const archaeopteryx = await main(options)
 *
 * @param options Optional server config
 */
const main = async (args?: ArchaeopteryxOptions): Promise<Server> => {
  if (args) {
    setGlobals(args)
  }

  if (help) {
    printHelp()
    Deno.exit()
  }

  if (port && !isValidPort(port)) {
    error(`${port} is not a valid port.`)
    Deno.exit()
  }

  secure && (await checkCredentials())

  const pathToCert = Path.isAbsolute(certFile) ? certFile : `${root}/${certFile}`
  const pathToKey  = Path.isAbsolute(keyFile)  ? keyFile  : `${root}/${keyFile}`
  // In certain browsers the server will crash if Self-signed certificates are not allowed.
  // Ref: https://github.com/denoland/deno/issues/5760
  server = secure
    ? serveTLS({
        port: port,
        certFile: pathToCert,
        keyFile: pathToKey,
      })
    : serve({ port })
    
  const maybeInterfacesFunction:any = eval("Deno.networkInterfaces")
  if (!(maybeInterfacesFunction instanceof Function)) {
    const { getNetworkAddr } = await import('./utils/local-ip.ts')
    const networkAddr = await getNetworkAddr()
    printStart(root, port, [networkAddr], secure)
  } else {
    const ipAddresses = maybeInterfacesFunction().filter((each:any)=>each.family=="IPv4").map((each:any)=>each.address)
    printStart(root, port, ipAddresses, secure)
  }

  startListener(router)
  return server
}

if (import.meta.main) {
  const parsedArgs = parse(args, {
    default: {
      d: false,
      s: false,
      n: false,
      p: 8080,
      t: false,
      c: false,
      l: false,
      certFile: 'archaeopteryx.crt',
      keyFile: 'archaeopteryx.key',
      entry: 'index.html',
    },
  })

  Object.keys(parsedArgs).map((arg: string) => {
    if (!isValidArg(arg)) {
      error(`${arg} is not a valid arg.`)
      printHelp()
      Deno.exit()
    }
  })

  await setGlobals({
    root: parsedArgs._.length > 0 ? String(parsedArgs._[0]) : '.',
    debug: parsedArgs.d,
    silent: parsedArgs.s,
    disableReload: parsedArgs.n,
    port: parsedArgs.p,
    secure: parsedArgs.t,
    help: parsedArgs.h,
    cors: parsedArgs.c,
    dontList: parsedArgs.f,
    certFile: parsedArgs.certFile,
    keyFile: parsedArgs.keyFile,
    entryPoint: parsedArgs.entry,
    before: parsedArgs.before,
    after: parsedArgs.after,
  })

  try {
    const config = await Deno.readFile(`${root}/archaeopteryx.json`)
    setGlobals(JSON.parse(decode(config)))
  } catch (err) {}

  const cwd = Deno.cwd()
  try {
    Deno.readDirSync(`${cwd}/${root}`)
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      const answer = await prompt(
        `The directory ${root} does not exist. Do you wish to create it? [y/n]`
      )
      if (answer === 'y' || 'Y') {
        await makeBoilerplate(cwd, root)
      } else {
        info('Exiting.')
        Deno.exit()
      }
    }
  }

  main()
}

export default main
