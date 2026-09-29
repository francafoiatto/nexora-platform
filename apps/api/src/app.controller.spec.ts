import { AppController } from './app.controller'; describe('health',()=>it('returns ok',()=>expect(new AppController().health()).toEqual({status:'ok'})));
