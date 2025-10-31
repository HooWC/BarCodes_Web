```
1. 登入界面
2. 注册界面
```

```
1. 扫描
2. Form 设计
```

```
node api


```

```
之前foxpro api 是 print checklist 和 test report PDF
加
```

```
Form Design

==

《Turbocharger》

Part Name        |   Chassis No.
Operator Name    |   Supervisor Name
Checked by       |   Approved by
Date In          |   Date Out

=====

Incoming Inspection / Core Management
Exterior                  				  | 11/02 | √ |  X
Housing                   				  | 11/02 | √ |  X

Disassembly Process
Compressor housing        				  | 11/02 | √ |  X
Turbo housing             				  | 11/02 | √ |  X
Compressor impeller       				  | 11/02 | √ |  X
Inner components          				  | 11/02 | √ |  X
Turbine impeller / shaft  				  | 11/02 | √ |  X
Control housing assembly  				  | 11/02 | √ |  X

Cleaning / Paint
Compressor housing        				  | 11/02 | √ |  X
Turbo housing             				  | 11/02 | √ |  X
Compressor impeller       				  | 11/02 | √ |  X
Inner components          				  | 11/02 | √ |  X
Turbine impeller / shaft                   | 11/02 | √ |  X
Control housing assembly                   | 11/02 | √ |  X

Remediate / Repair Activity
Compressor housing           			  | 11/02 | √ |  X
Turbo housing                			  | 11/02 | √ |  X
Compressor impeller / shaft  			  | 11/02 | √ |  X
Control housing assembly     			  | 11/02 | √ |  X

Re-assembly
Turbocharger re-assembly  				 | 11/02 | √ |  X

Turbocharger Assembly Inspection
QC Final Inspection   					| 12/02 | √ |  X
Testing               					 | 12/02 | √ |  X
Labelling             					 | 12/02 | √ |  X
Packaging / Storage / Install on truck    | 12/02 | √ |  X
```

```
1. 新的form？
2. 他们scan的是新的还是旧的？
```

```
SELECT * FROM import_reman_part_ERP WHERE cserial_no = 我发的cserial_no data 'FW1EXY-12264'
通常有六个model

可以查看import_reman_part_ERP里的reman_part
ALTERNATOR
BRAKE SYSTEM
INTERCOOLER
RADIATOR
STARTER MOTOR
TURBOCHARGER

如果数据库里有哪一个
```

```
根目录的foxpro_api JOB v3 server api要修改

之前的SELECT * FROM import_reman_part_ERP WHERE cserial_no = 'FW1EXY-12264'是对的
接下来是 SELECT * FROM dsoi WHERE cserial_no = 'FW1EXY-12264'，如果有找到数据才去turnPage，不然就返回一个alert的错误，说找不到这个chassis no

然后如果在dsoi找到了就去turnPage
```

```
保存的时候才拿partno
```

