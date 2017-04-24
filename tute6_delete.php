<!DOCTYPE html>
<body>

<center>
<h2>Insert Product Details</h2>
</center>
<?php
//include('db_conn.php'); //db connection
$subid = $_POST["ID"];
$subName = $_POST["Name"];
$subPrice =$_POST["Price"];
$subDescription =$_POST["Description"];
$subclick = $_POST['delete'];
if(isset($subclick)){
$servername = 'localhost';
$username = 'dwang14';
$passwords = '455946';
$dbname = 'dwang14';
$conn = new mysqli($servername,$username,$passwords,$dbname);
$con = mysql_connect("localhost","dwang14","455946");
$db_selected = mysql_select_db("dwang14",$con);
//$sql1 = "INSERT INTO KIT202_product(ID,Name,Price,Description) VALUES('$subid','$subName','$subPrice','$subDescription')";
$sql1 = "delete from KIT202_product where `ID`= '{$subid}'";
$sql = "select * from KIT202_product;";
$query = mysql_query($sql);
$conn ->query($sql1);
$query1 = mysql_query($sql1);
while ($row=mysql_fetch_array($query)) {
    $rows[]=$row;
}
    echo "<hr>";
    echo "<table>";
    echo "<tr>";
    echo "<th>ID</th>";
    echo "<th>Name</th>";
    echo "<th>Price</th>";
    echo "<th>Description</th>";
    echo "</tr>";  
foreach ($rows as $key => $v) {  
    echo "<tr>";
    echo "<td>";
    echo $v['ID'];
    echo "</td>";
    echo "<td>";
    echo $v['Name']; 
    echo "</td>";
    echo "<td>";
    echo $v['Price'];
    echo "</td>";
    echo "<td>";
    echo $v['Description'];
    echo "</td>";
    echo "</tr>"; 
} 
    echo "</table>";    
    echo "<hr>";
    mysql_close($con);
    $conn ->close();
}
?>
<form action="#" method="post">
ID: <br> 
<input type="text" value="" name="ID"> 
<br>
<!--
Name: <br>
<input type="text" value="" name="Name">
<br>
Price: <br>
<input type="text" value="" name="Price">
<br>
Description:<br>
<input type="text" value="" name="Description">
<br>
definition of the term primary key and foreign key:
The PRIMARY KEY constraint uniquely identifies each record in a database table.

Primary keys must contain UNIQUE values, and cannot contain NULL values.

A table can have only one primary key, which may consist of single or multiple fields.

A FOREIGN KEY is a key used to link two tables together.

A FOREIGN KEY in a table points to a PRIMARY KEY in another table.


Q2: Selection and projection:
Projection means choosing which columns (or expressions) the query shall return.

Selection means which rows are to be returned.

















-->
<input type="Submit" name="delete" value="delete"> 
<input type="Reset" name="Reset"> <br>
<button>go to the main</button>
</form>

</body>
</html>