<?php

include_once("config.php");

/*
  Works with (tested):
    SMF 2.0.1
    SMF 2.0.11
*/
if (!$context['user']['is_guest']):
    $smfUserId = $context['user']['id'];
    $username = $context['user']['username'] != null ? $context['user']['username'] : "NoUserHaxer";
    $authKey = md5(uniqid(rand(), true));

    $DBH = new PDO("mysql:host=127.0.0.1;dbname=$dbName", $dbUser, $dbPass);
    $DBH->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
    $DBH->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Check if the chat_auth column exists in the smf_members table, add it if not
    if (count($DBH->query("SHOW COLUMNS FROM smf_members WHERE Field = 'chat_auth'")->fetchAll())) {
        // Do nothing
    } else {
        $DBH->exec("ALTER TABLE smf_members ADD chat_auth varchar(32)");
    }

    $DBH->exec("UPDATE smf_members SET chat_auth = '$authKey' WHERE id_member = '$smfUserId'");
    $DBH = null;

    include("ChimeraIRC-client/index.html");
?>

  <script type="text/javascript">
    client.SMFconnect("<?php echo $authKey; ?>", "<?php echo $username ?>")
  </script>

<?php endif; ?>