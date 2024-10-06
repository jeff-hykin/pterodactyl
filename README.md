<!-- <p align="center">
  <img src="media/archaeopteryx_2.png" title="Archaeopteryx" width="320" style="margin: 48px 48px">
</p>

<p align="center" style="margin-top: 48px">
<a href="https://github.com/joakimunge/archaeopteryx/actions">
<img src="https://img.shields.io/github/workflow/status/joakimunge/archaeopteryx/ci?style=for-the-badge"></a>
<a href="https://github.com/joakimunge/archaeopteryx/releases">
<img src="https://img.shields.io/github/v/release/joakimunge/archaeopteryx?style=for-the-badge"></a>
</p> -->

---
<img width="1396" alt="Screen Shot 2023-04-09 at 6 26 06 PM" src="https://user-images.githubusercontent.com/17692058/230801323-08dad910-98b6-45c0-9763-11fd63e27b79.png">

<a href="https://www.flaticon.com/free-icons/dinosaur" title="dinosaur icons">(Icon created by max.icons - Flaticon)</a>

# What is this?

A fork of Denoliver, which is a small, zero config dev & static file server with live reloading written in TypeScript for Deno intended for prototyping and Single Page Applications. This fork adds support for multiple ip-detection, along with more robust error handling.

### Changes from Denoliver

- Fixed handling of file paths with spaces in the name
- Fixed credential handling and detection
- Better IP detection using new Deno API's
- Improved hanlding of long file names (no more clipping)
- Improved file explorer view (file type sorting, seperation of folder/files)

# How do I install it?

```sh
deno install --global -n archy -Af https://deno.land/x/archaeopteryx/mod.ts
```

Alternatively, list each permission:

```sh
deno install -n archy --allow-net --allow-read --allow-write --allow-run --allow-sys https://deno.land/x/archaeopteryx/mod.ts
```


## Prerequisites

### To run this you need to have [Deno](https://deno.land/) 1.0 or later installed.

## Key Features

- Dependency free! No third party dependencies.
- Live reload
- Supports client side routing for Single Page Applications.
- Directory lists
- Supports HTTPS
- Allows for programmatic use as a module
- Boilerplating for rapid prototyping.
- Injectable HTTP request interceptors. (TS & JS)

## How do I use it?

Serve your directory

```s
$ archy ./demo
```

## Options

Archaeopteryx comes with a couple of options to customize your experience.

```s
--help           # Help
--debug          # Debug for more verbose output - Defaults to false
--noReload       # Disable live reload - Defaults to false
--secure         
--filesOnly      # no directories (obviously)
--cors           # Use CORS - Defaults to false
--silent         # Disable all output - Defaults to false
--port <PORT>    # Specify desired port - Defaults to 8080
--certFile=<..>    # Specify certificate file - Defaults to archaeopteryx.crt
--keyFile=<..>     # Specify key file - Defaults to archaeopteryx.key
--entry=<..>       # Specify optional entrypoint - Defaults to index.html
--before=<..>   # Before request Interceptor(s)
--after=<..>    # After request Interceptor(s)
```

### Directory Listing

Archaeopteryx supports indexing of served directories and provides a simple interface, with dark mode support, for navigating a project folder.

<p align="center">
  <img src="media/list.png" alt="Directory listing">
</p>

### Optional boilerplating

If the given directory doesn't exist, archaeopteryx will ask you if you want to create a boilerplate. This will generate an a basic project folder and serve it for you. Very useful to get up and running quickly.

```
├── index.html
├── index.css
├── app.js
```

### Interceptors

Archaeopteryx allows you to inject your own request interceptors to be fired before or after the HTTP requests has been handled by the server.
This can be one or more functions which have access to the request object (instance of [Deno.Request](https://doc.deno.land/builtin/stable#Request)) and gets called in the order they are defined with the output of the previous function (piped). **These functions must all return the request object.**

Interceptors can be a single function, for example:

```typescript
// before.ts

export default (req: ServerRequest) => {
  req.headers.set('Authorization', 'Bearer some-token')
  return req
}
```

or an array of functions:

```typescript
const setHeaders = (req: ServerRequest) => {
  req.headers.set('Authorization', 'Bearer some-token')
  return req
}

const logRequestUrl = (req: ServerRequest) => {
  console.log(req.url)
  return req
}

export default [setHeaders, logRequestUrl]
```

of course this can also be used when using Archaeopteryx as a module:

```typescript
import archy from "https://deno.land/x/archaeopteryx/mod.ts"

const server = archy({
  port: 6060,
  before: (req: ServerRequest) => {
    req.headers.set('Authorization', 'Bearer some-token')
    return req
  },
  // root?: string
  // port?: number
  // silent?: boolean
  // disableReload?: boolean
  // debug?: boolean
  // cors?: boolean
  // secure?: boolean
  // help?: boolean
  // dontList?: boolean
  // certFile?: string
  // keyFile?: string
  // entryPoint?: string
  // before?: string | Interceptor | Interceptor[]
  // after?: string | Interceptor | Interceptor[]
})

```

## Configuration

If you want, you can place a configuration file called `archaeopteryx.json` in the folder you are serving to avoid having to use command line arguments to customize its behaviour. By default it will look like this:

```JSON
{
  "root": ".",
  "port": 8080,
  "disableReload": false,
  "silent": false,
  "debug": false,
  "secure": false,
  "cors": false,
  "dontList": false,
  "before": "before.ts",
  "after": "after.ts",
  "certFile": "some_file.crt",
  "keyFile": "some_file.key",
  "entryPoint": "index.html"
}
```

## API

Archaeopteryx can also be used as a module in any Deno project.
This exposes an instance of [Deno.Server](https://deno.land/std/http/server.ts#L125).

The main function accepts the same config object as specified in the config file above.

```typescript
import archaeopteryx from 'https://deno.land/x/archaeopteryx/mod.ts'

const server = archaeopteryx({ port: 6060, cors: true })

server.close() // Close the server
```

## Serve over HTTPS

To use HTTPS you will need a trusted self-signed certificate. If you're on macOS you can use [This](https://github.com/kingkool68/generate-ssl-certs-for-local-development) bash script to easily generate one.

Name the cert and key files `archaeopteryx.crt` and `archaeopteryx.key` and place them in your working dir. You can configure these names to be whatever you want with the config file, or the `--certFile` and `--keyFile` flags.

## Disclaimer

**This project is not intended for production use. It started out as a way for me personally to learn Deno, and is merely a tool to quickly get a file server up and running.**

## Acknowledgements

This project was heavily inspired by [lukejacksonn](https://github.com/lukejacksonn)s fantastic [Servor](https://github.com/lukejacksonn/servor/)
