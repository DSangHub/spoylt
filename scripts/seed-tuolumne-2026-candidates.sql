-- Tuolumne County Voter Information Guide, November 3, 2026.
-- Partial roster: only candidates with statements in this guide. The guide explicitly says it is not a complete candidate list.
-- Candidate numbers below are import identifiers, not certified ballot order.
-- Source: https://www.tuolumnecounty.ca.gov/DocumentCenter/View/31666
with s as (
  insert into public.county_candidate_sources (state_code,county_name,election_date,election_name,source_url,coverage_status,coverage_note)
  values ('CA','Tuolumne','2026-11-03','November 3, 2026 General Election','https://www.tuolumnecounty.ca.gov/DocumentCenter/View/31666','in_progress','Partial roster of local candidates with statements in the county voter guide. Guide says it is not complete; county local candidate list link was unavailable at import. Candidate numbers are import identifiers, not official ballot order.')
  on conflict (state_code,county_name,election_date,source_url)
  do update set checked_at=now(),coverage_status=excluded.coverage_status,coverage_note=excluded.coverage_note
  returning id
)
insert into public.county_election_candidates (source_id,contest_code,office_name,district,jurisdiction_level,seats_to_fill,candidate_name,candidate_number,ballot_status)
select s.id,v.* from s cross join (values
('YCCD-TA1','Yosemite Community College District Trustee Area 1','1','school',1,'Don Davis',1,'qualified_on_ballot'),
('YCCD-TA1','Yosemite Community College District Trustee Area 1','1','school',1,'William Andrew Dunn',2,'qualified_on_ballot'),
('SUP-2','County Supervisor District 2','2','county',1,'Juli Healy',1,'qualified_on_ballot'),
('SUP-2','County Supervisor District 2','2','county',1,'Ryan Campbell',2,'qualified_on_ballot'),
('GCSD','Groveland Community Services District Board',null,'special_district',3,'Steve Perreira',1,'qualified_on_ballot'),
('GCSD','Groveland Community Services District Board',null,'special_district',3,'John Armstrong',2,'qualified_on_ballot'),
('GCSD','Groveland Community Services District Board',null,'special_district',3,'Bruce Dudley',3,'qualified_on_ballot'),
('GCSD','Groveland Community Services District Board',null,'special_district',3,'Robert Swan',4,'qualified_on_ballot'),
('GCSD','Groveland Community Services District Board',null,'special_district',3,'Donald Felts',5,'qualified_on_ballot'),
('GCSD','Groveland Community Services District Board',null,'special_district',3,'Bruce M. Thompson',6,'qualified_on_ballot'),
('GCSD','Groveland Community Services District Board',null,'special_district',3,'Robert W. Turney Sr',7,'qualified_on_ballot'),
('TUD-1','Tuolumne Utilities District Division 1','1','special_district',1,'Tom Crosby',1,'qualified_on_ballot'),
('TUD-1','Tuolumne Utilities District Division 1','1','special_district',1,'Ron W. Ringen',2,'qualified_on_ballot')
) v(contest_code,office_name,district,jurisdiction_level,seats_to_fill,candidate_name,candidate_number,ballot_status)
on conflict (source_id,contest_code,candidate_number)
do update set office_name=excluded.office_name,district=excluded.district,jurisdiction_level=excluded.jurisdiction_level,seats_to_fill=excluded.seats_to_fill,candidate_name=excluded.candidate_name,ballot_status=excluded.ballot_status,updated_at=now();
