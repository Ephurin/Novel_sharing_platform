import asyncio
async def forward(reader,writer,host,port):
 try:
  remote_r,remote_w=await asyncio.open_connection(host,port)
  async def pump(r,w):
   while data:=await r.read(65536): w.write(data);await w.drain()
  done,pending=await asyncio.wait([asyncio.create_task(pump(reader,remote_w)),asyncio.create_task(pump(remote_r,writer))],return_when=asyncio.FIRST_COMPLETED)
  for task in pending: task.cancel()
  remote_w.close()
 finally: writer.close()
async def main():
 a=await asyncio.start_server(lambda r,w: forward(r,w,'postgres',5432),'0.0.0.0',15432)
 b=await asyncio.start_server(lambda r,w: forward(r,w,'mongodb',27017),'0.0.0.0',17017)
 async with a,b: await asyncio.gather(a.serve_forever(),b.serve_forever())
asyncio.run(main())
