const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const context = vm.createContext({ Date });
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../js/candidate-hashtags.js'),'utf8'), context);
const now = new Date('2026-10-10T12:00:00Z');
const user = { id:'owner' };
const verified = { user_id:'owner', verification_type:'candidate',status:'verified',identity_status:'verified',expires_at:'2026-11-04T00:00:00Z',election_date:'2026-11-03' };
test('only current verified candidate owner gets hashtag tools',()=>{
 assert.equal(context.candidateHashtagEligible(user,verified,now),true);
 for(const changes of [{status:'pending_review'},{status:'revoked'},{identity_status:'not_started'},{verification_type:'official'},{user_id:'other'},{expires_at:null},{expires_at:'2026-10-01T00:00:00Z'},{election_date:'2026-10-01'},{election_date:null}]) {
  assert.equal(context.candidateHashtagEligible(user,{...verified,...changes},now),false);
 }
 assert.equal(context.candidateHashtagEligible(null,verified,now),false);
});
test('copyable hashtag is canonical regardless of user capitalization',()=>{
 assert.equal(context.normalizeCandidateHashtag(' #JoeSmithDistrict5 '),'joesmithdistrict5');
 assert.equal(context.normalizeCandidateHashtag(' Vote_Joe5 '),'vote_joe5');
});
