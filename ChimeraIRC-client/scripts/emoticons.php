<?php

$path = "../images/smileys/";
$filetypes = array(
    ".jpg",
    ".jpeg",
    ".gif",
    ".png"
);
$emoticons = array();

foreach ($filetypes as $ft) {
    $emoticons = array_merge($emoticons, glob($path . "*" . $ft));
}

for ($i = 0; $i < count($emoticons); $i++ ) {
    $ar = explode("/", $emoticons[$i]);
    $ar = end($ar);
    $ar = explode(".", $ar);
    $emoticons[$i] = "{\"file\": \"". $ar[0] . "." . $ar[1] ."\", \"code\": \":". $ar[0] .":\"}";
}

header("Content-Type: application/json");
echo "{\"emoticons\":[" . implode(",", $emoticons) . "]}";

?>
