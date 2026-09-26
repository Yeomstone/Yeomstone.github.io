$(document).ready(function(){
			
			$.each($(".titlebox1"),function(i){
    			$(this).find("strong").html("점 검"+(i+1));
    		});
    		
    		var manualNo = [];
    		
    		if(mngNo != ''){
				$(".result_box_detail").each(function(i){
					let cnt = 0;
					$(this).find('.tb_basic').each(function(x){
						let tbodyClass = $(this).find("tbody").attr("class");
						if(tbodyClass != "img"){
							let td = $(this).find("tbody").children();
							let tdCnt = 0;
							td.each(function(y){
								let isEmpty = 0;
								let trLength = $(this).children().length;
								$(this).children().each(function(){
									if($(this).html() == ''){
										isEmpty++
									}
								})
								
								trLength == isEmpty? $(this).remove() : '';
								
								$(this).children().each(function(){
									if($(this).html() != ''){
										tdCnt ++;
									}
								})
							})
							tdCnt > 0 ? cnt ++ : cnt;
							if(tdCnt == 0){
								$(this).parent().parent().remove();
							}
						} else {
							let thead = $(this).find("thead").children().length;
							let tbody = $(this).find("tbody").children().length;
							
							if(thead == 0 && tbody == 0){
								$(this).parent().parent().remove()
							}
						}
					})
					if(cnt == 0){
						$(this).remove()
					};
				})
			}
			
			let now = new Date();
			let nYear = now.getFullYear().toString() * 1 - 1;
			
			$.each($(".titlebox1"),function(i){
	   			let ttr2_1 = $(this).next().find('.result_box_detail .tb_basic > thead');
	   			let mnum = $(this).next().find(">div").attr('mnum');
	   			
	   			ttr2_1.children().each(function(i){
	   				let mdlNoLenth = $($(this).parent().prev().find("thead > tr >th")[0]).find("input").length;
	   				let mdlNoL     = "";
	   				
	       			if(mdlNoLenth > 0){
						mdlNoL = $($(this).parent().prev().find(">tr >th")[0]).find(".mdlNo").val();
	       			}
	       			
      				let th = $(this).parent().parent().find("thead");
      				
      				if(th.find(".th").length > 0){
      					let num = 8;
      					let semiannual;
      					      					      					
      					for(let e = 0; e <= 5; e++){
      						if(th.children().children().eq(num).find(".th").val() == '' || th.children().children().eq(num).find(".th").val() == null){
      							let year = 	nYear;
	      						if(e%2 == 1){
	      							if(e == 1){
	      								year = year;
	      							}else if(e == 3){
	      								year = year - 1;
	      							}else{
	      								year = year - 2;
	      							}
	      							semiannual = "년 상반기";
	      						} else {
	      							if(e == 0){
	      								year = year;
	      							}else if(e == 2){
	      								year = year - 1;
	      							}else{
	      								year = year - 2;
	      							}
	      							semiannual = "년 하반기"
	      						}
      							th.children().children().eq(num).find(".th").val(year + semiannual);	
      						}
      						num--
      					}
      				} else if(th.find(".th2").length == 3) {
      					let cnt = 0;
      					let num = 2;
      					for(let e = 0; e <= 3; e++){
      						let year = nYear - cnt;
      						if(th.children().eq(1).find(".th2").eq(num).val() == '' || th.children().eq(1).find(".th2").eq(num).val() == null){
      							th.children().eq(1).find(".th2").eq(num).val(year);
      						}
      						cnt++
      						num--
      					}
      				} else if(th.find(".th3").length == 3){
      					let cnt = 0;
      					let num = 2;
      					for(let e = 0; e <= 3; e++){
      						let year = nYear - cnt;
      						if(th.children().eq(0).find(".th3").eq(num).val() == '' || th.children().eq(0).find(".th3").eq(num).val() == null){
      							th.children().eq(0).find(".th3").eq(num).val(year)	
      						}
      						cnt++
      						num--
      					}
      				} else if(th.find(".th4").length == 3){
      					let cnt = 0;
      					let num = 2;
      					for(let e = 0; e <= 3; e++){
      						let year = nYear - cnt;
      						if(th.children().eq(1).find(".th4").eq(num).val() == '' || th.children().eq(1).find(".th4").eq(num).val() == null){
      							th.children().eq(1).find(".th4").eq(num).val(year)	
      						}
      						cnt++
      						num--
      					}
      				}
				});
			})
    		
    		if(res.length > 0){
    			for(let i = 0; i < res.length; i++){
        			manualNo.push({"manualNo" : res[i].manualNo
        				, "insHist" : res[i].insHist
        				, "insMeth" : res[i].insMeth
        				, "insStd" : res[i].insStd
        				, "insOpinion" : res[i].insOpinion
        				, "mNumber" : res[i].mNumber
						, "atchFileId" : res[i].atchFileId
        				})
    			}
    			
    			manualNo = manualNo.reduce(function(acc, current) {
    				  if (acc.findIndex(({ insHist, insMeth, insStd, manualNo }) => insHist === current.insHist && insMeth === current.insMeth && insStd === current.insStd && manualNo === current.manualNo) === -1) {
    				    acc.push(current);
    				  }
    				  return acc;
    				}, []);
    			
    			$.each($(".titlebox1"),function(i){
    				let ttr1 = $(this).next().find(">div").find('.tb_basic > tbody > tr');
    				let ttr2 = $(this).next().find('.result_box_detail .tb_basic > tbody');
    				let mnum = $(this).next().find(">div").attr('mnum');
    				
    				if(mngNo != ''){
						$(this).closest(".result_box").css("display", "none");
						
						for(let i = 0; i < res.length; i++){
							if(res[i].manualNo == mnum){
								$(this).closest(".result_box").css("display", "block");
							}
						}
    				}
    				
    				
    				ttr1.each(function(){
        				
        				let tr = $(this);
        				let td = tr.children();
        				
        				let insStd = [];
            			let	insMeth = [];
    	        		
        				if(td.eq(1).find('input').length == '3'){
        					if(td.eq(0).text() == '점검기준'){
        						td.eq(1).find('input').each(function(){
        							for(let e = 0; e < manualNo.length; e++){
        								if(manualNo[e].manualNo === mnum){
        									let insStd = manualNo[e].insStd? manualNo[e].insStd.split(',') : "";
        									$(this).prop('checked',false);
        									mngNo != ''? $(this).attr("disabled", true) : $(this).attr("disabled", false);
											for(let z = 0; z < insStd.length; z++){
												if($(this).val() == insStd[z]){
													$(this).prop('checked',true);
		        								}
											}
        								}
        							}
        						})
        					} else if(td.eq(0).text() == '점검방법'){
        						td.eq(1).find('input').each(function(){
        							for(let e = 0; e < manualNo.length; e++){
        								if(manualNo[e].manualNo === mnum){
	        								let insMeth = manualNo[e].insMeth? manualNo[e].insMeth.split(',') : "";
	        								$(this).prop('checked',false);
	        								mngNo != ''? $(this).attr("disabled", true) : $(this).attr("disabled", false);
											for(let z = 0; z < insMeth.length; z++){
												if($(this).val() == insMeth[z]){
													$(this).prop('checked',true);
		        								}
											}
        								}
        							}
        						})
        					}
        				} else {
        					if(td.eq(0).text() == '점검내역'){
        						for(let e = 0; e < manualNo.length; e++){
        							if(manualNo[e].manualNo === mnum){
        								td.eq(1).find('input').val(manualNo[e].insHist);
        							}
        						}
        					} else if(td.eq(0).text() == '점검의견'){
        						for(let e = 0; e < manualNo.length; e++){
        							if(manualNo[e].manualNo === mnum){
        								td.eq(1).find('textarea').val(manualNo[e].insOpinion);
        								td.eq(1).find('input').val(manualNo[e].mNumber);
        							}
        						}
        					} else {
        						for(let e = 0; e < manualNo.length; e++){
        							if(manualNo[e].manualNo === mnum){
        								td.eq(1).find('input').val(manualNo[e].atchFileId);
        							}
        						}
        					}
        				}
        			})
    			})
    		}
    		
    		var manualNo_list = JSON.parse(JSON.stringify(manualNo));
    		if(manualNo_list.length > 0){
				$(".result_box").each(function(){
					$(this).css("display","none");
				    for(let i = 0; i < manualNo_list.length; i++){
				    	let mnum = $(this).find(".tb_wrap").attr("mnum");
				    	if(manualNo_list[i].manualNo == mnum){
				    		$(this).css("display","block");
				    		manualNo_list[i] = "";
				    	}
				    }
				})
			}
			
			inspNum();
    		
    		$.each($(".titlebox1"),function(i){
    			let next = $(this).next();
				let tr = next.find(".tb_basic > tbody > tr");
				tr.eq(3).find("th").append("<button class='btn_sch' type='button'>검색</button>");
    		})
    		
    		//생성또는 수정일때 사용.
    		if(res.length == 0 || mngNo == ''){
	    		$(".btn_sch").on("click",function(){
	    		let mNumber = $(this).parent().next().find("input").val();
	    			//alert($(".selectInsert[sNum=0]").val());
					var openParam = "scrollbars=yes,toolbar=yes,resizable=no,width=1700px,height=800px,top=10,left=10";
	    			window.open(gbn_getContextPath()+"/applyRegResultPopup.do?mNumber="+ mNumber +"&snum="+$(this).parent().next().find("textarea").attr("sNum")+"&mNum="+$(this).closest(".tb_wrap").attr("mNum"),'selectPop',openParam);
	    		});
	    		$.each($(".selectInsert"),function(i){
	    			$(this).attr("sNum",i);
	    		});
    		}
    		
    		if(res.length == 0 || mngNo == ''){
	    		//$.each($(".tb_wrap "),function(){
	    		//	let count = $(this).find(".tb_basic > tbody > tr").find("img").length * 1;
	    		//	if(count == 0){
	    		//		$(this).prev().append("<span style='float:right;cursor:pointer; margin-left:15px;font-size: 16px;' onclick='fn_addRow(this)'>+</span><span style='float:right;cursor:pointer; margin-left:15px;font-size: 16px;' onclick='fn_delRow(this)'>-</span>")
	    		//	}
	    		//});
	    		
	    		$(".result_box_detail").each(function(){
					let tb_basic = $(this).find(".tb_basic");
					
					$(tb_basic).each(function(){
						let tbodyClass = $(this).find("tbody").attr("class");
						let fix = $(this).attr('id');
						if(!fix){
							if(tbodyClass != "img"){
								let thead = $(this).find("thead > tr");
								let tbody = $(this).find("tbody > tr");
								let rowspan = "rowspan='"+thead.length+"'";
								let th = "";
								let td = "<td nowrap=' nowrap' ><a class=' '  title=' 행삭제'  href=' javascript:void(0)'  onclick=' fn_delRow(this)' ><span>삭제</span></a><br><a class=' '  title=' 행복사'  href=' javascript:void(0)'  onclick=' fn_add_clone(this)' ><span>행복사</span></a></td>";
					
								if(thead.length > 1){
									th = "<th "+ rowspan +" scope=' col'  style=' width: 60px; text-align: center;' ><a class=' btn_add'  href=' javascript:void(0)'  onclick=' fn_addRow(this)'  style=' padding-right: 20%' ><span>추가</span><a></th>";
								} else {
									$(thead).each(function(){
										th ="<th scope=' col'  style=' width: 60px; text-align: center;' ><a class=' btn_add'  href=' javascript:void(0)'  onclick=' fn_addRow(this)'  style=' padding-right: 20%' ><span>추가</span><a></th>";
									})
								}      
								$(thead).eq(0).append(th);
					            $(tbody).each(function(){
					                $(this).append(td);
					            })
							}
						}
					})
				})
    		}
    		
    		//삭제버튼
    		if(res.length == 0 ||  mngNo == ''){
	    		$.each($(".titlebox1 "),function(){
    				$(this).append("<button class='btn_del' type='button'>삭제</button>");
	    		});
    		}
    		
    		//숨긴항목 보이기
    		$("#show").on("click",function(){
	    		$(".result_box").css("display", "block");
	    		$(".sub_title3").each(function(i){
		        	$(this).css("display","block");
		        })
		        inspNum();
    		});
    		
    		$(".btn_del").on("click",function(){
    			if(confirm("삭제하시겠습니까?")){
	    			$(this).closest(".result_box").css("display", "none");
    			}
    			inspNum();
    		}).css("cursor","pointer");
    		//생성또는 수정일때 사용 끝.
    		
    		/*/상세일때.
    		$.each($("input[type=text]"),function(){
    			var vl = $(this).val();
    			$(this).parent().append("<span>"+vl+"</span>");
    			$(this).remove();
    		});
    		$("input[type=checkbox]").attr("disabled","disabled")
    		//상세일때 끝.
    		*/
    		
    		//textarea 글자수 카운트 function
    		$(".selectInsert").keyup(function(e) {
		        fn_textLength($(this));
		    });
		    $(".selectInsert").parent().parent().find('th').append("<br/><span>(0/660)</span>");
    	});
    	
    	function fn_addRow(obj){
     		var nexObj = $(obj).parent().parent().parent().parent();
     		
     		var th = $(nexObj.find("thead > tr")[0]).children();
     		var count = 0;
     		
     		$(th).each(function(i){
     			if($(this).attr("colspan")){
     				count += $(this).attr("colspan") * 1;
     			} else {
     				count += 1;
     			}
     		})
     		
     		var innerHtml = "<tr>";
     		
     		for(let i = 1; i < count; i++){
     			innerHtml += "<td><input type='text'/> </td>";
     		}
     		
     		innerHtml += "<td nowrap=' nowrap' ><a class=' '  title=' 행삭제'  href=' javascript:void(0)'  onclick=' fn_delRow(this)' ><span>삭제</span></a><br><a class=' '  title='행복사'  href=' javascript:void(0)'  onclick=' fn_add_clone(this)' ><span>행복사</span></a></td></tr>";
    		
    		$(nexObj.find("tbody")).append(innerHtml);
    	}
    	

    	function fn_delRow(obj){
			$(obj).parent().parent().remove()
    	}
    	
    	function fn_add_clone(obj){
    		let tbody = $(obj).parent().parent().parent();
			let tr = $(obj).parent().parent();
			let clone = $(tr).clone();
			
			tbody.append(clone);
    	}
				
    function inspNum(){
		let cnt = 0;
		$.each($(".titlebox1"),function(i){
		    $(this).parent().css("display") == "none"? cnt ++ : "";
		    $(this).find("strong").html("점 검"+(i+1-cnt));
		});
		subTitle2Num();
	}
	
	function subTitle2Num(){
		let cnt = 0;
		$.each($(".sub_title2"),function(i){
		    $(this).css("display") == "none"? cnt++ : "";
		    let num = i + 1 - cnt;
		    let sNum = "3." + num;
		    let text = $(this).html().replace(/[^a-z|A-Z|ㄱ-ㅎ|가-힣|^\s]/g,'');
		    $(this).html(sNum+text);   
		});
		subTitle3Num();
	}
	
    function subTitle3Num(){
		$.each($(".resBoxGruopDiv"),function(i){    
		    let num = $(this).prev().html().substring(0,3);
		    let cnt = 0;
		    let length = 0;
		    let isCheck = true;
		    
		    $.each($(this).find(".resBoxDiv"),function(z){
		        length = $(this).find(".result_box").length;
		        
		        cnt = 0;
		         $.each($(this).find(".result_box"),function(z){
		            if($(this).css("display") == "none"){
		                cnt++;
		            }
		         })
		         
				length == cnt ? isCheck = false : true;
				
				if(length == cnt){
					$(this).prev().css("display","none");
				}
		    })
		    
		    let noneCnt = 0;
	        $.each($(this).find(".sub_title3"),function(e){
	        	if($(this).css("display") == 'none'){
	        		noneCnt++
	        	}
	            let subNum = e + 1 - noneCnt;
	            let text = $(this).html().replace(/[^a-z|A-Z|ㄱ-ㅎ|가-힣|^\s]/g,'');
	            $(this).html(num + "." + subNum + text);
	        })
	        
	        let sCnt = 0;
			$.each($(".sub_title2"),function(i){
			    $(this).css("display") == "none"? sCnt++ : "";
			    let num = i + 1 - cnt;
			    let sNum = "3." + num;
			    let text = $(this).html().replace(/[^a-z|A-Z|ㄱ-ㅎ|가-힣|^\s]/g,'');
			    $(this).html(sNum+text);   
			});
		});
		fn_bookmark();
	}
	
	function fn_textLength(arg){
		var textLength = $(arg).val().length;
		$(arg).parent().parent().find('span').html("(" + textLength + " / 660)")
	}
	
	//책갈피 기능 추가
	function fn_bookmark(){
		$(".markSubTitle").find("ul").children().remove();
		
		$(".sub_title3").each(function(){
			if($(this).css("display") != "none"){
			    let idx = $(this).html().substr(0, 5);
			    $(this).attr("id", idx);
			    let li = "<li><a href='#"+idx+"'>"+$(this).html()+"</a></li>";
			    $(".markSubTitle").find("ul").append(li);
		    }
		})
	}
	
