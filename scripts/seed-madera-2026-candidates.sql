-- Madera County Elections, Contests on Ballot list printed September 29, 2026.
-- Local school, county and city contests only; statewide/federal/judicial races excluded.
-- A qualified write-in is marked separately from printed ballot candidates.
-- Source: https://votemadera.com/wp-content/uploads/2026/09/Contests-on-Ballot.pdf
with s as (
  insert into public.county_candidate_sources (state_code,county_name,election_date,election_name,source_url,source_published_on,coverage_status,coverage_note)
  values ('CA','Madera','2026-11-03','November 3, 2026 Consolidated General Election','https://votemadera.com/wp-content/uploads/2026/09/Contests-on-Ballot.pdf','2026-09-29','source_complete','All local school, county and city contest candidates in county Contests on Ballot proof list printed September 29, 2026, including one qualified write-in. Off-ballot contests excluded.')
  on conflict (state_code,county_name,election_date,source_url)
  do update set checked_at=now(),coverage_status=excluded.coverage_status,coverage_note=excluded.coverage_note
  returning id
)
insert into public.county_election_candidates (source_id,contest_code,office_name,district,jurisdiction_level,seats_to_fill,candidate_name,candidate_number,ballot_status)
select s.id,v.* from s cross join (values
('3121','State CCCD, Governing Board Member Area 1','1','school',1,'DESTINY RODRIGUEZ',1,'qualified_on_ballot'),
('3121','State CCCD, Governing Board Member Area 1','1','school',1,'NICHOLÁS SALINAS',2,'qualified_on_ballot'),
('3121','State CCCD, Governing Board Member Area 1','1','school',1,'OMAIR JAVAID',3,'qualified_on_ballot'),
('3141','Chawanakee USD, Governing Board Member Area 1','1','school',1,'ELISABETH PARISH',1,'qualified_on_ballot'),
('3141','Chawanakee USD, Governing Board Member Area 1','1','school',1,'LORI ISENHART',2,'qualified_on_ballot'),
('3143','Chawanakee USD, Governing Board Member Area 3','3','school',1,'JESSIE MOORE',1,'qualified_on_ballot'),
('3143','Chawanakee USD, Governing Board Member Area 3','3','school',1,'KELLY GREEN, II',2,'qualified_on_ballot'),
('3174','Madera USD, Governing Board Member Area 4','4','school',1,'JOETTA FLEAK',1,'qualified_on_ballot'),
('3174','Madera USD, Governing Board Member Area 4','4','school',1,'JOHN JASPER',2,'qualified_on_ballot'),
('3177','Madera USD, Governing Board Member Area 7','7','school',1,'ANALI MANZANO',1,'qualified_on_ballot'),
('3177','Madera USD, Governing Board Member Area 7','7','school',1,'NADEEM AHMAD',2,'qualified_on_ballot'),
('3214','Bass Lake JUSD, Governing Board Member Area 4','4','school',1,'CARRIE JENKINS',1,'qualified_on_ballot'),
('3214','Bass Lake JUSD, Governing Board Member Area 4','4','school',1,'STEVEN HIGH',2,'qualified_on_ballot'),
('3223','Chowchilla ESD, Governing Board Member Area 3','3','school',1,'CONRAD GAUNT',1,'qualified_on_ballot'),
('3223','Chowchilla ESD, Governing Board Member Area 3','3','school',1,'MICHAEL EGGERT',2,'qualified_on_ballot'),
('3224','Chowchilla ESD, Governing Board Member Area 4','4','school',1,'KENNETH N. LASITER',1,'qualified_on_ballot'),
('3224','Chowchilla ESD, Governing Board Member Area 4','4','school',1,'MICHELLE LINHARES',2,'qualified_on_ballot'),
('4005','County Supervisor, District 5','5','county',1,'FRANK BIGELOW',1,'qualified_on_ballot'),
('4005','County Supervisor, District 5','5','county',1,'MELANIE "MEL" BARKER',2,'qualified_on_ballot'),
('4005','County Supervisor, District 5','5','county',1,'EDWARD "BEAU" CAMPBELL',3,'qualified_write_in'),
('5120','Mayor, City of Chowchilla',null,'city',1,'WASEEM AHMED',1,'qualified_on_ballot'),
('5120','Mayor, City of Chowchilla',null,'city',1,'KELLY SMITH',2,'qualified_on_ballot'),
('5121','Chowchilla City Councilmember, District 1','1','city',1,'DENNIS HAWORTH',1,'qualified_on_ballot'),
('5121','Chowchilla City Councilmember, District 1','1','city',1,'CHAD MIDDLETON',2,'qualified_on_ballot'),
('5122','Chowchilla City Councilmember, District 2','2','city',1,'JOSH D. MOORE',1,'qualified_on_ballot')
) v(contest_code,office_name,district,jurisdiction_level,seats_to_fill,candidate_name,candidate_number,ballot_status)
on conflict (source_id,contest_code,candidate_number)
do update set office_name=excluded.office_name,district=excluded.district,jurisdiction_level=excluded.jurisdiction_level,seats_to_fill=excluded.seats_to_fill,candidate_name=excluded.candidate_name,ballot_status=excluded.ballot_status,updated_at=now();
