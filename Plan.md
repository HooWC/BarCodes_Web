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
	[pk] [bigint] IDENTITY(1,1) NOT NULL,
	[job_id] [char](10) NULL,
	[reman_part] [varchar](30) NULL,
	[complete_status] [char](20) NULL,
	[completedt] [datetime] NULL,
	[cserial_no] [varchar](30) NULL,
	[wo_no] [varchar](50) NULL,
	[file_path] [ntext] NULL,
	[maker] [varchar](40) NULL,
	[partno] [varchar](50) NULL,
	[OperatorNM] [varchar](50) NULL,
	[SupervisorNM] [varchar](50) NULL,
	[Date_In] [datetime] NULL,
	[Date_Out] [datetime] NULL,
	[Cat1_dt] [datetime] NULL,
	[Cat1_Status] [bit] NULL,
	[Cat2_dt] [datetime] NULL,
	[Cat2_Status] [bit] NULL,
	[Cat3_dt] [datetime] NULL,
	[Cat3_Status] [varchar](3) NULL,
	[Rem1] [nvarchar](60) NULL,
	[Rem2] [nvarchar](60) NULL,
	[Rem3] [nvarchar](60) NULL,
	[Rem4] [nvarchar](60) NULL,
	[Rem5] [nvarchar](60) NULL,
	[Rem6] [nvarchar](60) NULL,
	[Rem7] [nvarchar](60) NULL,
	[Rem8] [nvarchar](60) NULL,
	[Rem9] [nvarchar](60) NULL,
	[Rem10] [nvarchar](60) NULL,
	[Rem11] [nvarchar](60) NULL,
	[Rem12] [nvarchar](60) NULL,
	[Rem13] [nvarchar](60) NULL,
	[Rem14] [nvarchar](60) NULL,
	[Rem15] [nvarchar](60) NULL,
	[Rem16] [nvarchar](60) NULL,
	[Rem17] [nvarchar](60) NULL,
	[Rem18] [nvarchar](60) NULL,
	[Rem19] [nvarchar](60) NULL,
	[Rem20] [nvarchar](60) NULL,
	[Rem21] [nvarchar](60) NULL,
	[Rem22] [nvarchar](60) NULL,
	[Rem23] [nvarchar](60) NULL,
	[Rem24] [nvarchar](60) NULL,
	[Rem25] [nvarchar](60) NULL,
	[Rem26] [nvarchar](60) NULL,
	[Rem27] [nvarchar](60) NULL,
	[tr_path] [ntext] NULL,

现在先弄Alternator Form.html，我要submit，要insert去import_reman_part_ERP里

job_id, cserial_no

reman_part 放我进哪一个template里的名称，ALTERNATOR,BRAKE SYSTEM,INTERCOOLER,RADIATOR,STARTER MOTOR,TURBOCHARGER

complete_status = 1

completedt , Date_Out 一样

Cat1_Status , Cat2_Status  是前两个部分打勾的 
Cat3_Status 是 如果打勾就写 OK, X就写 NG
那些Rem1，2，3，4是Remark，跟着顺序保存就可以了。

maker 是 拿dsoi taple里的 make + / + mgroup_id

wo_no = WH/MO_E/10100001 你放这个，然后保存，下一次就10100002，10100003，这样

```



```
保存的时候才拿partno
```

