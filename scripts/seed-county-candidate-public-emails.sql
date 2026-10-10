-- Published contact emails only, from the candidate's official county list or voter guide.
-- Withheld/blank entries remain NULL. Name is checked as well as contest and candidate number.
with contacts(county_name,contest_code,candidate_number,candidate_name,email) as (values
('Merced','910',1,'Ana Boyenga','anaboyenga4supt2026@gmail.com'),
('Merced','910',2,'Richard Lopez','rlopez4mcoe@gmail.com'),
('Merced','920',1,'John Magneson','john.magneson@me.com'),
('Merced','920',2,'Peg Larson','plarson@transcountytitle.com'),
('Merced','930',1,'Ryan Richard Heller','ryanrichardheller@mac.com'),
('Merced','960',1,'Jesse D. Perez','jessedominickperez@gmail.com'),
('Merced','960',2,'Geneva Marie Brett','genevabrett@gmail.com'),
('Merced','970',1,'Alice J. Pollard','alicepollard@chart.net'),
('Merced','1015',1,'Mary Camper','marycamper@yahoo.com'),
('Merced','1015',2,'Rich Randall','richrandallfortrustee@gmail.com'),
('Merced','1030',2,'John Pedrozo','JPEDROZO57@HOTMAIL.COM'),
('Merced','1075',1,'Hayde Berenice Sanchez-Lozano','cattona72o9@gmail.com'),
('Merced','1131',1,'Loretta Rose','rose-forarea4@gmail.com'),
('Merced','1165',1,'Gene Lieb','geneliebforschoolboard@gmail.com'),
('Merced','1200',1,'Mary Jackson','mary4turlock@yahoo.com'),
('Merced','1200',2,'Jayden Betbabanta','jaybet18@gmail.com'),
('Merced','1235',1,'Erin Hamm','ehamm@muhsd.org'),
('Merced','1305',1,'Kalli Spycher','kallipage@gmail.com'),
('Merced','1405',2,'Cindy Bell','silverbellbarn@aol.com'),
('Merced','1546',1,'Zachary D. Kuykendall','zkuykendall@weaverusd.org'),
('Merced','3000',1,'Roberto Montes-Yepez','robertomontesforatwater@gmail.com'),
('Merced','3000',2,'Mike Nelson','mikeforatwatermayor@gmail.com'),
('Merced','3170',2,'Japjeet Singh Uppal','japjeet4ca@gmail.com'),
('Merced','3210',2,'MOHINDER KANDA','mohinderkanda@yahoo.com'),
('Merced','3210',3,'Terika DeGraw','tdegraw@ci4ci.org'),
('Merced','3270',1,'Erasmo Viveros','erasmo@eviveros.com'),
('Merced','3270',2,'Marcus Chavez','marcuschavezd3@gmail.com'),
('Merced','3335',1,'Shane Smith','info@shanesmithformercedcouncil4.com'),
('Merced','3345',1,'John G. Bliss Jr.','Bliss2wincouncil2026@gmail.com'),
('Merced','3345',3,'Fue Xiong','Fue@FueXiong.com'),
('Merced','4025',1,'Angelique Lemmon-Halfmoon','angeliclita@gmail.com'),
('Merced','4402',2,'Kevin Rapoza','kevin.temsa@gmail.com'),
('Calaveras','1801',1,'Steven E. Looper','slooper@goldrush.com'),
('Calaveras','1911',1,'DON DAVIS','dddavis0089@icloud.com'),
('Calaveras','1911',2,'WILLIAM ANDREW DUNN','wadunn224@yahoo.com'),
('Calaveras','2002',1,'Lorraine G Angel','laineig@me.com'),
('Calaveras','2004',1,'Matthew Brock','mattbrock@sbcglobal.net'),
('Calaveras','2005',2,'SCOTT CRISP','dsandpscrisp@gmail.com'),
('Calaveras','2102',1,'NICOLAS VALENTE','luckylogger62@yahoo.com'),
('Calaveras','2103',2,'Scott Mcnurlin','mcnurlins@gmail.com'),
('Calaveras','2105',2,'Jodi Sledge','Jodisledge44@hotmail.com'),
('Calaveras','2205',2,'BRUCE GIUDICI','BGIUDICI@CALTEL.COM'),
('Calaveras','3001',1,'MICHAEL "MIKE" ZIEHLKE','mikeziehlke@yahoo.com'),
('Calaveras','4002',4,'Nicholas J. Meyer','nick_sandi_meyer@hotmail.com'),
('Calaveras','4007',1,'Brian Scott Rollinson','bsroll@yahoo.com'),
('Calaveras','4042',1,'Michael S. Jones','MOKELUMNEJONES@GMAIL.COM'),
('Calaveras','4117',3,'Timothy James Bottomley','tim1bottomley@gmial.com'),
('Calaveras','4132',5,'KENT LAMBERT','mr.mokehil@gmail.com'),
('Calaveras','4132',1,'MICHAEL R. DELL''ORTO','mike@mowami.com'),
('Calaveras','4133',1,'Michael David Fischer, Jr','amranch2003@yahoo.com'),
('Calaveras','4142',2,'William Bryan Wennhold','firedog51@comcast.net'),
('Calaveras','4142',1,'Dana M. Nichols','NICHOLSDANA@HOTMAIL.COM'),
('Calaveras','4147',1,'Timothy Daniel Adams','adamstim3601@gmail.com'),
('Calaveras','4302',1,'Richard Blood','newrichard.blood@outlook.com'),
('Calaveras','4307',4,'RALPH EMERSON','remerson@gabervillesd.org'),
('Calaveras','4512',2,'Michael Walker','mmwalk3611@sbcglobal.net'),
('Calaveras','4703',1,'Jeffrey James Robertson','JANDAROBERTSON@YAHOO.COM'),
('Calaveras','4704',1,'Russell L. Thomas','rthos2020@caltel.com'),
('Tuolumne','YCCD-TA1',1,'Don Davis','ddavis0089@icloud.com'),
('Tuolumne','GCSD',4,'Robert Swan','bswan@gcsd.org')
)
update public.county_election_candidates c set public_contact_email=v.email, contact_source_url=s.source_url, contact_reviewed_at=now(), updated_at=now()
from contacts v join public.county_candidate_sources s on s.county_name=v.county_name and s.state_code='CA' and s.election_date='2026-11-03'
where c.source_id=s.id and c.contest_code=v.contest_code and c.candidate_number=v.candidate_number and lower(c.candidate_name)=lower(v.candidate_name) and (c.public_contact_email is distinct from v.email or c.contact_source_url is distinct from s.source_url);

-- Two Madera District 5 candidates also appeared in the official June 2026 primary roster.
-- These are published campaign emails from that older county list, not from the November proof list.
update public.county_election_candidates c
set public_contact_email=v.email,
    contact_source_url='https://votemadera.com/wp-content/uploads/2026/03/official-candidate-list-03-11-2026.pdf',
    contact_reviewed_at=now(), updated_at=now()
from (values ('FRANK BIGELOW','info@frankbigelow.com'), ('MELANIE "MEL" BARKER','mel4supervisor@gmail.com')) v(name,email)
join public.county_candidate_sources s on s.county_name='Madera' and s.state_code='CA' and s.election_date='2026-11-03'
where c.source_id=s.id and c.contest_code='4005' and c.candidate_name=v.name;
