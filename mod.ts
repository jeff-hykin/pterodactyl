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
const settings: any = {
  root: '.',
  port: 8080,
  debug: false,
  silent: false,
  disableReload: false,
  secure: false,
  help: false,
  cors: false,
  dontList: false,
  certFile: 'archaeopteryx.crt',
  keyFile: 'archaeopteryx.key',
  entryPoint: 'index.html',
  before: [] as Array<Interceptor> | Interceptor,
  after: [] as Array<Interceptor> | Interceptor,
}

// is caught
const handleFileRequest = async (req: ServerRequest) => {
  try {
    const path = joinPath(settings.root, unescape(req.url))
    const file = await Deno.open(path)
    req.done.then(() => {
      file.close()
    })
    // is caught 
    return await req.respond({
      status: 200,
      headers: setHeaders(settings.cors, path),
      body: file,
    })
  } catch (err) {
    !settings.silent && settings.debug ? console.error(err) : error(err.message)
    // is caught
    await handleNotFound(req)
  }
}

// is caught
const handleRouteRequest = async (req: ServerRequest): Promise<void> => {
  try {
    const file = await readFile(`${settings.root}/${settings.entryPoint}`)
    const { hostname, port } = req.conn.localAddr as Deno.NetAddr
    // is caught
    await req.respond({
      status: 200,
      headers: setHeaders(settings.cors),
      body: settings.disableReload
        ? file
        : appendReloadScript(file, port, hostname, settings.secure),
    })
  } catch (err) {
    !settings.silent && settings.debug ? console.error(err) : error(err.message)
    // is caught
    await handleDirRequest(req)
  }
}

// is caught
const handleDirRequest = async (req: ServerRequest): Promise<void> => {
  const path = joinPath(settings.root, unescape(req.url))
  const dirUrl = `/${posix.relative(settings.root, path)}`
  const entries: DirEntry[] = []
  for await (const entry of Deno.readDir(path.replace(/\/$/, ''))) {
    const filePath = posix.join(dirUrl, '/', entry.name)
    entries.push({ ...entry, url: decodeURIComponent(filePath) })
  }

  await req.respond({
    status: 200,
    body: encode(dirTemplate(entries, dirUrl)),
    headers: setHeaders(settings.cors),
  })
}

const handleWs = async (req: ServerRequest): Promise<void> => {
  if (!watcher) {
    watcher = Deno.watchFs(settings.root, { recursive: true })
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
    !settings.silent && error(err.message)
  }
}

// is caught
const handleNotFound = async (req: ServerRequest): Promise<void> => {
  return req.respond({
    status: 404,
    headers: setHeaders(settings.cors),
    body: inject404(req.url),
  })
}

const router = async (req: ServerRequest): Promise<void> => {
  try {
    if (!(req instanceof ServerRequest)) {
      throw new InterceptorException()
    }
    printRequest(req)
    if (!settings.disableReload && isWebSocket(req)) {
      return await handleWs(req)
    }
    if (req.method === 'GET' && req.url === '/') {
      // is caught
      return await handleRouteRequest(req)
    }
    const path = joinPath(settings.root, unescape(req.url))
    const itemInfo = await Deno.stat(path)
    
    if (itemInfo.isDirectory) {
        if (!settings.dontList) {
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
    } catch (err2) {
        !settings.silent && settings.debug ? console.log(err2) : error(err2.message)
    }
    !settings.silent && settings.debug ? console.log(err) : error(err.message)
    err instanceof InterceptorException && Deno.exit()
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
      if (settings.before) {
        handler(await callInterceptors(req, settings.before))
      } else {
        handler(req)
      }
      if (settings.after) {
        callInterceptors(req, settings.after)
      }
    }
  } catch (err) {
    !settings.silent && settings.debug ? console.error(err) : error(err.message)
  }
}

const setGlobals = async (args: ArchaeopteryxOptions): Promise<void> => {
  settings.root = args.root ?? '.'
  settings.help = args.help ?? false
  settings.debug = args.debug ?? false
  settings.silent = args.silent ?? false
  settings.disableReload = args.disableReload ?? false
  settings.port = args.port ?? 8080
  settings.secure = args.secure ?? false
  settings.cors = args.cors ?? false
  settings.dontList = args.dontList ?? false
  settings.certFile = args.certFile ?? 'archaeopteryx.crt'
  settings.keyFile = args.keyFile ?? 'archaeopteryx.key'
  settings.entryPoint = args.entryPoint ?? 'index.html'

  if (args.before) {
    if (typeof args.before === 'function') {
      settings.before = args.before
    } else {
      try {
        const path = posix.resolve(`${settings.root}/${args.before}`)
        const interceptors = await import(path)
        settings.before = interceptors.default
      } catch (err) {
        !settings.silent && settings.debug ? console.error(err) : error(err.message)
      }
    }
  }

  if (args.after) {
    if (typeof args.after === 'function') {
      settings.before = args.after
    } else {
      try {
        const path = posix.resolve(`${settings.root}/${args.after}`)
        const interceptors = await import(path)
        settings.after = interceptors.default
      } catch (err) {
        !settings.silent && settings.debug ? console.error(err) : error(err.message)
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

  if (settings.help) {
    printHelp()
    Deno.exit()
  }

  if (settings.port && !isValidPort(settings.port)) {
    error(`${settings.port} is not a valid port.`)
    Deno.exit()
  }
  
  if (settings.secure) {
    // 
    // check credentials
    // 
    const pathToCert = Path.isAbsolute(settings.certFile) ? settings.certFile : `${settings.root}/${settings.certFile}`
    const pathToKey  = Path.isAbsolute(settings.keyFile)  ? settings.keyFile  : `${settings.root}/${settings.keyFile}`
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

  const pathToCert = Path.isAbsolute(settings.certFile) ? settings.certFile : `${settings.root}/${settings.certFile}`
  const pathToKey  = Path.isAbsolute(settings.keyFile)  ? settings.keyFile  : `${settings.root}/${settings.keyFile}`
  // In certain browsers the server will crash if Self-signed certificates are not allowed.
  // Ref: https://github.com/denoland/deno/issues/5760
  server = settings.secure
    ? serveTLS({
        port: settings.port,
        certFile: pathToCert,
        keyFile: pathToKey,
      })
    : serve({ port: settings.port })
    
  const maybeInterfacesFunction:any = eval("Deno.networkInterfaces")
  if (!(maybeInterfacesFunction instanceof Function)) {
    const { getNetworkAddr } = await import('./utils/local-ip.ts')
    const networkAddr = await getNetworkAddr()
    printStart(settings.root, settings.port, [networkAddr], settings.secure)
  } else {
    const ipAddresses = maybeInterfacesFunction().filter((each:any)=>each.family=="IPv4").map((each:any)=>each.address)
    printStart(settings.root, settings.port, ipAddresses, settings.secure)
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
    const config = await Deno.readFile(`${settings.root}/archaeopteryx.json`)
    setGlobals(JSON.parse(decode(config)))
  } catch (err) {}

  const cwd = Deno.cwd()
  try {
    Deno.readDirSync(`${cwd}/${settings.root}`)
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      const answer = await prompt(
        `The directory ${settings.root} does not exist. Do you wish to create it? [y/n]`
      )
      if (answer === 'y' || 'Y') {
        await makeBoilerplate(cwd, settings.root)
      } else {
        info('Exiting.')
        Deno.exit()
      }
    }
  }

  main()
}

export default main
