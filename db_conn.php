<?php
//connect to mysql
$mysqli = new mysqli('localhost', 'dwang14', '455946', 'dwang14');

if (mysqli_connect_errno()) {
	    printf("Connect failed: %s\n", mysqli_connect_error());
	    exit();
	}
?>