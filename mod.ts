import { ensure } from 'https://deno.land/x/ensure/mod.ts'

ensure({
  denoVersion: "1.28.0", // for Deno.networkInterfaces
})
import * as Path from "https://deno.land/std@0.128.0/path/mod.ts"
import {
  acceptWebSocket,
  serve,
  Server,
  serveTLS,
  ServerRequest,
  posix,
} from './deps.ts'
import { parse } from "https://deno.land/std@0.168.0/flags/mod.ts"
import { capitalize, indent, toCamelCase, digitsToEnglishArray, toPascalCase, toKebabCase, toSnakeCase, toScreamingtoKebabCase, toScreamingtoSnakeCase, toRepresentation, toString, regex, findAll, iterativelyFindAll, escapeRegexMatch, escapeRegexReplace, extractFirst, isValidIdentifier, removeCommonPrefix, didYouMean } from "https://deno.land/x/good@1.6.0.0/string.js"

/* Archaeopteryx utils */
import {
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
import dirTemplate from './directory.ts'
import { InterceptorException } from './utils/errors.ts'

type ArchaeopteryxOptions = {
  root?: string
  port?: number
  hostname?: string | null
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
  allowAbsolute?: boolean,
  before?: string | Interceptor | Interceptor[]
  after?: string | Interceptor | Interceptor[]
}

type Interceptor = (r: ServerRequest) => ServerRequest

/* Globals */
const settings: any = {
  root: '.',
  port: 8080,
  hostname: null,
  debug: false,
  silent: false,
  disableReload: false,
  secure: false,
  help: false,
  cors: false,
  dontList: false,
  allowAbsolute: false,
  certFile: 'archaeopteryx.crt',
  keyFile: 'archaeopteryx.key',
  entryPoint: 'index.html',
  before: [] as Array<Interceptor> | Interceptor,
  after: [] as Array<Interceptor> | Interceptor,
}

import * as handlers from "./handlers.ts"
const router = async (req: ServerRequest): Promise<void> => {
  if (settings.debug) {
      console.log(`req is:`,req)
  }
  try {
    if (!(req instanceof ServerRequest)) {
      throw new InterceptorException()
    }
    printRequest(req)
    if (!settings.disableReload && isWebSocket(req)) {
      return await handlers.handleWs(settings, req)
    }
    if (req.method === 'GET' && req.url === '/') {
      // is caught
      return await handlers.handleRouteRequest(settings, req)
    } else {
      handlers.handleFileOrFolderRequest(settings, req);
    }
  } catch (err) {
    !settings.silent && settings.debug ? console.log(err) : error(err)
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
  server: Server,
  handler: (req: ServerRequest) => void
): Promise<void> => {
  try {
    for await (const req of server) {
      if (settings.before.length>0) {
        handler(await callInterceptors(req, settings.before))
      } else {
        handler(req)
      }
      if (settings.after.length>0) {
        callInterceptors(req, settings.after)
      }
    }
  } catch (err) {
    !settings.silent && settings.debug ? console.error(err) : error(err)
  }
}

const setGlobals = async (args: ArchaeopteryxOptions): Promise<void> => {
  settings.root = args.root ?? '.'
  settings.hostname = args.hostname
  settings.help = args.help ?? false
  settings.debug = args.debug ?? false
  settings.silent = args.silent ?? false
  settings.disableReload = args.disableReload ?? false
  settings.port = args.port ?? 8080
  settings.secure = args.secure ?? false
  settings.cors = args.cors ?? false
  settings.dontList = args.dontList ?? false
  settings.allowAbsolute = args.allowAbsolute ?? false
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
        !settings.silent && settings.debug ? console.error(err) : error(err)
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
        !settings.silent && settings.debug ? console.error(err) : error(err)
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
  //   
  // get hostname
  //   
  const ipAddresses = Deno.networkInterfaces().filter((each:any)=>each.family=="IPv4").map((each:any)=>each.address)
  if (!settings.hostname && settings.secure && ipAddresses.some(each=>each!="127.0.0.1")) {
    settings.hostname = ipAddresses.filter(each=>each!="127.0.0.1")[0]
  } else if (!settings.hostname) {
    settings.hostname = ipAddresses[0]
  }
  printStart(settings.root, settings.port, settings.hostname, settings.secure)
  // In certain browsers the server will crash if Self-signed certificates are not allowed.
  // Ref: https://github.com/denoland/deno/issues/5760
  const server = settings.secure
    ? serveTLS({
        port: settings.port,
        certFile: pathToCert,
        keyFile: pathToKey,
        hostname: settings.hostname,
      })
    : serve({ port: settings.port, hostname: settings.hostname })
    
  startListener(server, router)
  return server
}

if (import.meta.main) {
  var argOptions = {
    boolean: [
      "h", "help",
      "d", "debug",
      "n", "noReload",
      "t", "secure",
      "f", "filesOnly",
      "c", "cors",
      "s", "silent",
      "allowAbsolute",
    ],
    default: {
      p: undefined,
      port: undefined,
      certFile: 'archaeopteryx.crt',
      keyFile: 'archaeopteryx.key',
      entry: 'index.html',
    },
  }
  const parsedArgs = parse(Deno.args, argOptions)
  parsedArgs.h = parsedArgs.h || parsedArgs.help
  parsedArgs.d = parsedArgs.d || parsedArgs.debug
  parsedArgs.n = parsedArgs.n || parsedArgs.noReload
  parsedArgs.t = parsedArgs.t || parsedArgs.secure
  parsedArgs.f = parsedArgs.f || parsedArgs.filesOnly
  parsedArgs.c = parsedArgs.c || parsedArgs.cors
  parsedArgs.s = parsedArgs.s || parsedArgs.silent
  parsedArgs.p = parsedArgs.p ?? parsedArgs.port
  
  // validate
  const validWords = argOptions.boolean.concat(Object.keys(argOptions.default))
  for (const each of Object.keys(parsedArgs)) {
    if (each == "_") {
        continue
    }
    try {
      didYouMean({ givenWord:each, possibleWords: validWords, autoThrow:true })
    } catch (error) {
      printHelp()
      Deno.exit(1)
    }
  }

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
    allowAbsolute: parsedArgs.allowAbsolute,
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
