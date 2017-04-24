<!DOCTYPE html>
<body>
<center>
<h2>Update Product Details</h2>
</center>
<?php
include('db_conn.php'); //db connection
//include('db_conn.php'); //db connection
//mysqli_query($mysqli,"select * from KIT202_product ORDER BY `ID`");
//mysqli_close($mysqli);

$subid = $_POST["ID"];
$subName = $_POST["Name"];
$subPrice =$_POST["Price"];
$subDescription =$_POST["Description"];
$subclick = $_POST['update'];
if(isset($subclick)){
$servername = 'localhost';
$username = 'dwang14';
$passwords = '455946';
$dbname = 'dwang14';
$conn = new mysqli($servername,$username,$passwords,$dbname);
$con = mysql_connect("localhost","dwang14","455946");
$db_selected = mysql_select_db("dwang14",$con);
//$sql1 = "INSERT INTO KIT202_product(ID,Name,Price,Description) VALUES('$subid','$subName','$subPrice','$subDescription')";
$sql = "select * from KIT202_product order by `ID`;";
$query = mysql_query($sql);
$conn-> query($sql);
//$conn ->query($sql);

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
Name: <br>
<input type="text" value="" name="Name">
<br>
Price: <br>
<input type="text" value="" name="Price">
<br>
Description:<br>
<input type="text" value="" name="Description">
<br>
<input type="Submit" name="update" value="update"> 
<input type="Reset" name="Reset"> <br>
<button>go to the main</button>
</form>



</body>
</html>