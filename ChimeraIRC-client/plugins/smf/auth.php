<?php

require_once("config.php");
    
/*
    Tested SMF 2.0.1 and SMF 2.1.1
*/

if (isset($_POST['key'])) {

    $authKey = $_POST['key'];
    $userData = null;

    if (strlen($authKey) != 32) {
        return null;
    }

    $DBH = new PDO("mysql:host=127.0.0.1;dbname=$dbName", $dbUser, $dbPass);
    $DBH->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
    $DBH->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $STH = $DBH->prepare("SELECT m.real_name, g.online_color
                          FROM smf_members AS m LEFT JOIN smf_membergroups AS g
                          ON m.id_group = g.id_group WHERE m.chat_auth = :authkey");
    $STH->execute(array(':authkey' => "$authKey"));
    $result = $STH->fetchAll();
    $DBH = null;

    if (sizeof($result) == 0) {
        return null;
    }

    $username = $result[0][0] != null ? $result[0][0] : "NoName";
    $userColor = $result[0][1] != null ? $result[0][1] : "#764625";

    $userData = "$username|$userColor";
    
    echo json_encode($userData);
}

?>