install:
	deno install -f --allow-read --allow-net --allow-run --allow-write --allow-sys mod.ts

test:
	deno test --allow-read --allow-net --allow-run --allow-write --allow-sys