import {describe,it,expect} from 'vitest'; describe('nexora',()=>it('has task statuses',()=>expect(['TODO','IN_PROGRESS','REVIEW','DONE']).toHaveLength(4)));
