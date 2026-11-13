CREATE TABLE [ai_agent_conversation] (
 [id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY, [user_id] INT NOT NULL,
 [title] VARCHAR(255), [is_active] BIT NOT NULL DEFAULT 1, [created_at] DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT [ai_agent_conversation_user_fkey] FOREIGN KEY ([user_id]) REFERENCES [users]([id])
);
CREATE INDEX [ai_agent_conversation_user_id_created_at_idx] ON [ai_agent_conversation]([user_id], [created_at]);
CREATE TABLE [ai_agent_message] (
 [id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY, [conversation_id] INT NOT NULL,
 [role] VARCHAR(20) NOT NULL, [content] TEXT NOT NULL, [input_tokens] INT NOT NULL DEFAULT 0,
 [output_tokens] INT NOT NULL DEFAULT 0, [created_at] DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT [ai_agent_message_conversation_fkey] FOREIGN KEY ([conversation_id]) REFERENCES [ai_agent_conversation]([id])
);
CREATE INDEX [ai_agent_message_conversation_id_created_at_idx] ON [ai_agent_message]([conversation_id], [created_at]);
CREATE TABLE [ai_agent_tool_log] (
 [id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY, [message_id] INT NOT NULL, [tool_name] VARCHAR(100) NOT NULL,
 [arguments] TEXT NOT NULL, [result_digest] TEXT, [duration_ms] INT, [created_at] DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT [ai_agent_tool_log_message_fkey] FOREIGN KEY ([message_id]) REFERENCES [ai_agent_message]([id])
);
CREATE INDEX [ai_agent_tool_log_tool_name_idx] ON [ai_agent_tool_log]([tool_name]);
-- Create the CASL subject and grant it only to the two existing head-office roles.
IF NOT EXISTS (SELECT 1 FROM [menus] WHERE LOWER([title]) = 'ai agent' AND [deleted_at] IS NULL)
 INSERT INTO [menus] ([title], [url], [icon], [is_active], [created_at]) VALUES ('AI Agent', '/analytics', '', 1, CURRENT_TIMESTAMP);
DECLARE @menu_id INT = (SELECT TOP 1 [id] FROM [menus] WHERE LOWER([title]) = 'ai agent' AND [deleted_at] IS NULL ORDER BY [id]);
IF NOT EXISTS (SELECT 1 FROM [permissions] WHERE [menu_id] = @menu_id AND LOWER([name]) = 'read' AND [deleted_at] IS NULL)
 INSERT INTO [permissions] ([name], [menu_id], [is_active], [created_at]) VALUES ('read', @menu_id, 1, CURRENT_TIMESTAMP);
DECLARE @permission_id INT = (SELECT TOP 1 [id] FROM [permissions] WHERE [menu_id] = @menu_id AND LOWER([name]) = 'read' AND [deleted_at] IS NULL ORDER BY [id]);
INSERT INTO [role_permissions] ([role_id], [permission_id], [created_at])
 SELECT r.[id], @permission_id, CURRENT_TIMESTAMP FROM [roles] r
 WHERE r.[name] IN ('Admin HO', 'Super User') AND r.[deleted_at] IS NULL
 AND NOT EXISTS (SELECT 1 FROM [role_permissions] rp WHERE rp.[role_id] = r.[id] AND rp.[permission_id] = @permission_id AND rp.[deleted_at] IS NULL);
