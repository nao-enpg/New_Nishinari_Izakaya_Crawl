INSERT INTO tags (id, name, sort_order) VALUES (1,'立ち飲み',1),(2,'朝から',2);
INSERT INTO izakayas (id, name, sort_order, updated_at) VALUES (10,'店A',1,CURRENT_TIMESTAMP),(11,'店B',2,CURRENT_TIMESTAMP);
INSERT INTO izakaya_tags (izakaya_id, tag_id) VALUES (10,1),(10,2),(11,1);
INSERT INTO users (id, name, updated_at) VALUES (1,'nao',CURRENT_TIMESTAMP);
