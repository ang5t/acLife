export const compress = async (input: Uint8Array): Promise<Uint8Array> => {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  await writer.write(input as BufferSource);
  await writer.close();
  const compressed = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(compressed);
};

export const decompress = async (input: Uint8Array): Promise<Uint8Array> => {
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  await writer.write(input as BufferSource);
  await writer.close();
  const decompressed = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(decompressed);
};
